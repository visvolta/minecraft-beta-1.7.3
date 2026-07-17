/**
 * Beta 1.7.3 snow/ice precipitation simulation.
 *
 * Ports the snow/ice placement logic from World.updateBlocksAndPlayCaveSounds()
 * (lines 1938-1952 of World.java).
 *
 * Beta exact logic:
 *   1. For each loaded chunk, 1/16 chance per tick
 *   2. Pick random (localX, localZ) within chunk
 *   3. findTopSolidBlock to get surface Y
 *   4. Check: biome.getEnableSnow() AND y >= 0 AND y < 128
 *   5. Check: getSavedLightValue(EnumSkyBlock.Block, x, y, z) < 10
 *   6. Snow: if raining AND air at y AND canPlaceBlockAt AND block below
 *      is not 0, not ice, and is solid material → place snow
 *   7. Ice: if waterStill at y-1 with metadata 0 → place ice
 *
 * Also handles snow melting via scheduled ticks (not here).
 */

import { BlockIds } from '../../blocks/BlockId';
import type { BlockRegistry } from '../../blocks/BlockRegistry';
import type { ChunkManager } from '../ChunkManager';
import type { BlockUpdateWorld } from '../BlockUpdateWorld';
import type { WeatherState } from './WeatherState';
import type { ClimateSampler } from '../generation/climate/ClimateSampler';
import { selectBiome } from '../generation/climate/BiomeSelector';
import { JavaRandom } from '../generation/random/JavaRandom';
import { CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z } from '../chunkConstants';

export interface PrecipitationMetrics {
  readonly snowPlaced: number;
  readonly iceFormed: number;
  readonly snowMelted: number;
  readonly iceMelted: number;
  readonly precipitationSamples: number;
  readonly lightRejections: number;
  readonly biomeRejections: number;
  readonly supportRejections: number;
  readonly loadedChunksSampled: number;
}

export class PrecipitationSimulator {
  private readonly random: JavaRandom;

  // Per-tick metrics (reset each tick)
  private snowPlaced = 0;
  private iceFormed = 0;
  private snowMelted = 0;
  private iceMelted = 0;
  private precipitationSamples = 0;
  private lightRejections = 0;
  private biomeRejections = 0;
  private supportRejections = 0;
  private loadedChunksSampled = 0;

  public constructor(sessionSeed: bigint) {
    this.random = new JavaRandom(sessionSeed ^ 0x5DEECE66Dn);
  }

  /**
   * Run one precipitation tick. Called from Engine via game tick callback
   * when weather is active (raining).
   *
   * Matches Beta's updateBlocksAndPlayCaveSounds() snow/ice section exactly.
   */
  public tick(
    chunks: ChunkManager,
    world: BlockUpdateWorld,
    blocks: BlockRegistry,
    climate: ClimateSampler,
    weather: WeatherState,
    gameTick: number,
  ): void {
    // Reset per-tick metrics
    this.snowPlaced = 0;
    this.iceFormed = 0;
    this.snowMelted = 0;
    this.iceMelted = 0;
    this.precipitationSamples = 0;
    this.lightRejections = 0;
    this.biomeRejections = 0;
    this.supportRejections = 0;
    this.loadedChunksSampled = 0;

    const isRaining = weather.raining;

    // Beta: iterate loaded chunks, 1/16 chance per chunk per tick
    for (const chunk of chunks) {
      this.loadedChunksSampled += 1;

      // Beta: if (this.rand.nextInt(16) == 0)
      if (this.random.nextInt(16) !== 0) continue;

      this.precipitationSamples += 1;

      // Beta PRNG: field_9437_g = field_9437_g * 3 + 1013904223
      // Use chunk coordinates + gameTick as deterministic seed
      const var6 = this.nextIntPRNG(chunk.chunkX * 31 + chunk.chunkZ * 17 + gameTick);
      const localX = var6 & 15;
      const localZ = (var6 >> 8) & 15;
      const worldX = chunk.chunkX * CHUNK_SIZE_X + localX;
      const worldZ = chunk.chunkZ * CHUNK_SIZE_Z + localZ;

      // Beta: findTopSolidBlock(x, z) — scan down from Y=127
      const surfaceY = this.findTopSolidBlock(world, worldX, worldZ);
      if (surfaceY < 0 || surfaceY >= CHUNK_SIZE_Y) continue;

      // Beta: getWorldChunkManager().getBiomeGenAt(x, z).getEnableSnow()
      const [climateSample] = climate.sampleRegion(worldX, worldZ, 1, 1);
      if (climateSample === undefined) continue;
      const biome = selectBiome(climateSample);
      if (!biome.enableSnow) {
        this.biomeRejections += 1;
        continue;
      }

      // Beta: var14.getSavedLightValue(EnumSkyBlock.Block, var7, var9, var8) < 10
      // This is the block light at the surface position
      const blockLight = world.getBlocklight(worldX, surfaceY, worldZ);
      if (blockLight >= 10) {
        this.lightRejections += 1;
        continue;
      }

      const blockAtSurface = world.getBlock(worldX, surfaceY, worldZ);
      const blockBelow = world.getBlock(worldX, surfaceY - 1, worldZ);

      // Snow placement (Beta lines 1942-1943):
      // if (isRaining() && var15 == 0 && Block.snow.canPlaceBlockAt(...)
      //     && var10 != 0 && var10 != Block.ice.blockID
      //     && Block.blocksList[var10].blockMaterial.getIsSolid())
      if (isRaining && blockAtSurface === BlockIds.Air) {
        if (blockBelow !== 0 && blockBelow !== BlockIds.Ice && isOpaqueSolid(blockBelow, blocks)) {
          world.setBlock(worldX, surfaceY, worldZ, BlockIds.Snow, {
            reason: 'world',
            notifyNeighbours: true,
            updateLighting: true,
          });
          // Schedule melting tick (Beta: setTickOnLoad=true)
          world.scheduleBlockTick(worldX, surfaceY, worldZ, BlockIds.Snow, 40);
          this.snowPlaced += 1;
        } else {
          this.supportRejections += 1;
        }
      }

      // Ice formation (Beta line 1947):
      // if (var10 == Block.waterStill.blockID && var14.getMetadata(...) == 0)
      if (blockBelow === BlockIds.WaterStill) {
        const waterMeta = world.getBlockMetadata(worldX, surfaceY - 1, worldZ);
        if (waterMeta === 0) {
          world.setBlock(worldX, surfaceY - 1, worldZ, BlockIds.Ice, {
            reason: 'world',
            notifyNeighbours: true,
            updateLighting: true,
          });
          // Schedule melting tick
          world.scheduleBlockTick(worldX, surfaceY - 1, worldZ, BlockIds.Ice, 40);
          this.iceFormed += 1;
        }
      }
    }
  }

  /**
   * Beta's findTopSolidBlock: scans down from Y=127 to find the top solid block.
   */
  private findTopSolidBlock(world: BlockUpdateWorld, x: number, z: number): number {
    for (let y = CHUNK_SIZE_Y - 1; y >= 0; y--) {
      const blockId = world.getBlock(x, y, z);
      if (blockId !== 0) return y;
    }
    return -1;
  }

  /**
   * PRNG matching Beta's field_9437_g pattern.
   * Beta: field_9437_g = field_9437_g * 3 + 1013904223
   */
  private nextIntPRNG(seed: number): number {
    return ((seed * 3 + 1013904223) & 0x7fffffff);
  }

  public getMetrics(): PrecipitationMetrics {
    return {
      snowPlaced: this.snowPlaced,
      iceFormed: this.iceFormed,
      snowMelted: this.snowMelted,
      iceMelted: this.iceMelted,
      precipitationSamples: this.precipitationSamples,
      lightRejections: this.lightRejections,
      biomeRejections: this.biomeRejections,
      supportRejections: this.supportRejections,
      loadedChunksSampled: this.loadedChunksSampled,
    };
  }
}

/**
 * Returns true if the block is opaque and solid (Beta material check).
 */
function isOpaqueSolid(blockId: number, blocks: BlockRegistry): boolean {
  const def = blocks.getById(blockId);
  if (def === undefined) return false;
  return def.solid && !def.transparent;
}
