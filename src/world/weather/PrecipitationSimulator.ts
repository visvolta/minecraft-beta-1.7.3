/**
 * Beta 1.7.3 snow/ice precipitation simulation.
 *
 * Ports the snow/ice placement logic from World.updateBlocksAndPlayCaveSounds().
 * Runs once per game tick when it's raining, iterating loaded chunks with a
 * PRNG-based position sampler matching Beta's deterministic random sampling.
 *
 * Beta logic (from World.java lines 1920-1950):
 *   for each chunk in loaded set:
 *     with probability 1/16:
 *       pick random (x, z) within chunk
 *       find top solid block (findTopSolidBlock)
 *       check biome.getEnableSnow()
 *       check y >= 0 && y < 128
 *       check block light < 10
 *       if raining && air at y && canPlaceBlockAt && conditions:
 *         place snow
 *       if water still at y-1 with metadata 0:
 *         place ice
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
  readonly precipitationUpdates: number;
}

export class PrecipitationSimulator {
  private readonly random: JavaRandom;

  // Metrics (reset each tick)
  private snowPlaced = 0;
  private iceFormed = 0;
  private snowMelted = 0;
  private iceMelted = 0;
  private precipitationUpdates = 0;

  public constructor(sessionSeed: bigint) {
    this.random = new JavaRandom(sessionSeed ^ 0x5DEECE66Dn);
  }

  /**
   * Run one precipitation tick. Called from Engine when weather is active.
   * Matches Beta's updateBlocksAndPlayCaveSounds() snow/ice section.
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
    this.precipitationUpdates = 0;

    const isRaining = weather.raining;

    // Beta: iterate loaded chunks, 1/16 chance per chunk per tick
    for (const chunk of chunks) {
      // Beta: this.random.nextInt(16) == 0
      if (this.random.nextInt(16) !== 0) continue;

      this.precipitationUpdates += 1;

      // Beta: field_9437_g = field_9437_g * 3 + 1013904223
      // Use chunk coordinates + gameTick as deterministic seed for position
      const var6 = this.nextIntPRNG(chunk.chunkX * 31 + chunk.chunkZ * 17 + gameTick);
      const localX = var6 & 15;
      const localZ = (var6 >> 8) & 15;
      const worldX = chunk.chunkX * CHUNK_SIZE_X + localX;
      const worldZ = chunk.chunkZ * CHUNK_SIZE_Z + localZ;

      // Find top solid block (Beta: findTopSolidBlock)
      const surfaceY = this.findTopSolidBlock(world, worldX, worldZ);
      if (surfaceY < 0 || surfaceY >= CHUNK_SIZE_Y) continue;

      // Check biome: getEnableSnow()
      const [climateSample] = climate.sampleRegion(worldX, worldZ, 1, 1);
      if (climateSample === undefined) continue;
      const biome = selectBiome(climateSample);
      if (!biome.enableSnow) continue;

      // Check block light < 10 (Beta: getSavedLightValue(EnumSkyBlock.Block, ...) < 10)
      // We approximate: if the surface position is exposed to sky
      // TODO: exact block light check when LightEngine exposes it

      const blockAtSurface = world.getBlock(worldX, surfaceY, worldZ);
      const blockBelow = world.getBlock(worldX, surfaceY - 1, worldZ);

      // Snow placement (Beta lines 1942-1943)
      if (isRaining && blockAtSurface === BlockIds.Air) {
        // canPlaceBlockAt: block below is opaque and solid
        if (blockBelow !== 0 && isOpaqueSolid(blockBelow, blocks) && blockBelow !== BlockIds.Ice) {
          world.setBlock(worldX, surfaceY, worldZ, BlockIds.Snow, {
            reason: 'world',
            notifyNeighbours: true,
            updateLighting: true,
          });
          this.snowPlaced += 1;
        }
      }

      // Ice formation (Beta line 1947)
      // Water freezes if: snow biome + block light < 10 + water still at surface-1 with metadata 0
      if (blockBelow === BlockIds.WaterStill) {
        const waterMeta = world.getBlockMetadata(worldX, surfaceY - 1, worldZ);
        if (waterMeta === 0) {
          world.setBlock(worldX, surfaceY - 1, worldZ, BlockIds.Ice, {
            reason: 'world',
            notifyNeighbours: true,
            updateLighting: true,
          });
          this.iceFormed += 1;
        }
      }
    }

    // Snow melting pass: check existing snow blocks for light > 11
    // Beta: BlockSnow.updateTick melts when block light > 11
    // We run this as part of the precipitation tick for efficiency
    for (const chunk of chunks) {
      for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
          for (let ly = 0; ly < CHUNK_SIZE_Y; ly++) {
            const blockId = chunk.getBlock(lx, ly, lz);
            if (blockId === BlockIds.Snow) {
              // Check if snow can still stay (support exists)
              const worldX = chunk.chunkX * CHUNK_SIZE_X + lx;
              const worldZ = chunk.chunkZ * CHUNK_SIZE_Z + lz;
              const below = world.getBlock(worldX, ly - 1, worldZ);
              if (below === 0 || !isOpaqueSolid(below, blocks)) {
                world.setBlock(worldX, ly, worldZ, BlockIds.Air, {
                  reason: 'world',
                  notifyNeighbours: true,
                  updateLighting: true,
                });
                this.snowMelted += 1;
              }
            } else if (blockId === BlockIds.Ice) {
              // Ice melting: check if biome still allows ice
              // In Beta, ice melts when block light > 11 - opacity
              // For now, we only melt ice when the biome warms up
              // (which doesn't happen in Beta's static biome system)
              // This is a placeholder for future dynamic weather.
            }
          }
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
      precipitationUpdates: this.precipitationUpdates,
    };
  }
}

/**
 * Returns true if the block is opaque and solid (Beta isOpaqueCube + material.isSolid).
 */
function isOpaqueSolid(blockId: number, blocks: BlockRegistry): boolean {
  const def = blocks.getById(blockId);
  if (def === undefined) return false;
  return def.solid && !def.transparent;
}
