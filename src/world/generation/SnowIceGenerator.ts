/**
 * Beta 1.7.3 snow/ice terrain finalization.
 *
 * Ports the snow/ice placement from ChunkProviderGenerate's population phase
 * (lines 590-601 of ChunkProviderGenerate.java).
 *
 * Beta exact logic:
 *   1. Sample temperatures per column via WorldChunkManager.getTemperatures()
 *   2. For each column in chunk (+8 border for climate sampling):
 *      a. findTopSolidBlock to get surface Y
 *      b. adjustedTemp = temperature - (surfaceY - 64) / 64.0 * 0.3
 *      c. If adjustedTemp < 0.5 AND surfaceY > 0 AND surfaceY < 128:
 *         - If air at surface AND solid non-ice material below → place snow
 *         - If waterStill (metadata 0) at surface-1 → place ice
 *
 * This runs AFTER tree decoration, BEFORE loadGeneratedBlocks.
 * Operates on the raw blocks array (XZY layout).
 */

import { BlockIds } from '../../blocks/BlockId';
import type { ClimateSample } from './climate/ClimateSampler';
import { selectBiome } from './climate/BiomeSelector';
import { CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z } from '../chunkConstants';
import { SEA_LEVEL } from './terrainConstants';

export class SnowIceGenerator {
  /**
   * Applies snow and ice to the raw blocks array for a chunk.
   * Runs after terrain generation, surface replacement, cave carving,
   * and tree decoration — matching Beta's population order.
   *
   * @param chunkX Chunk X coordinate
   * @param chunkZ Chunk Z coordinate
   * @param blocks Raw blocks array (XZY layout, mutated in place)
   * @param climate Per-column climate samples (16x16, x + z*16)
   */
  public apply(_chunkX: number, _chunkZ: number, blocks: Uint8Array, climate: ClimateSample[]): void {
    // Beta iterates chunk +8 border for climate sampling
    // We only process columns within this chunk (0..15)
    for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
        const columnIndex = lx + lz * CHUNK_SIZE_X;
        const climateSample = climate[columnIndex];
        if (climateSample === undefined) continue;

        const biome = selectBiome(climateSample);
        if (!biome.enableSnow) continue;

        // findTopSolidBlock: scan down from Y=127 to find the top solid block.
        // Returns the Y of the solid block, NOT the air above it.
        const solidY = this.findTopSolidBlock(blocks, lx, lz);
        if (solidY < 0 || solidY >= CHUNK_SIZE_Y - 1) continue;

        // Beta: var23 = temperature - (var22 - 64) / 64.0 * 0.3
        // var22 is the solid surface Y (findTopSolidBlock result)
        const adjustedTemp = climateSample.temperature - (solidY - SEA_LEVEL) / 64.0 * 0.3;

        if (adjustedTemp >= 0.5) continue;

        const blockAtSurface = this.getBlock(blocks, lx, solidY, lz);
        const blockAbove = this.getBlock(blocks, lx, solidY + 1, lz);

        // Snow placement (Beta line 596-597):
        // Snow goes ON TOP of the solid surface at solidY+1
        // Conditions: air above, solid non-ice below
        if (
          solidY + 1 > 0 &&
          solidY + 1 < CHUNK_SIZE_Y &&
          blockAbove === BlockIds.Air &&
          blockAtSurface !== BlockIds.Air &&
          blockAtSurface !== BlockIds.Ice &&
          this.isOpaqueSolid(blockAtSurface)
        ) {
          this.setBlock(blocks, lx, solidY + 1, lz, BlockIds.Snow);
        }
      }
    }

    // Ice formation during generation (Beta line 83-84):
    // During terrain generation, water at sea level in cold areas is frozen.
    // This is already handled by BetaTerrainGenerator using the temperature
    // noise array. We only need to freeze exposed still water at the surface.
    for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
        const columnIndex = lx + lz * CHUNK_SIZE_X;
        const climateSample = climate[columnIndex];
        if (climateSample === undefined) continue;

        const biome = selectBiome(climateSample);
        if (!biome.enableSnow) continue;

        const solidY = this.findTopSolidBlock(blocks, lx, lz);
        if (solidY < 0 || solidY >= CHUNK_SIZE_Y) continue;

        // Freeze exposed still water at the solid surface
        const blockAtSurface = this.getBlock(blocks, lx, solidY, lz);
        if (blockAtSurface === BlockIds.WaterStill) {
          this.setBlock(blocks, lx, solidY, lz, BlockIds.Ice);
        }
      }
    }
  }

  /**
   * Scans down from Y=127 to find the top non-air block.
   */
  private findTopSolidBlock(blocks: Uint8Array, lx: number, lz: number): number {
    for (let y = CHUNK_SIZE_Y - 1; y >= 0; y--) {
      if (this.getBlock(blocks, lx, y, lz) !== BlockIds.Air) return y;
    }
    return -1;
  }

  /**
   * Returns true if the block is an opaque solid (for snow support).
   */
  private isOpaqueSolid(blockId: number): boolean {
    switch (blockId) {
      case BlockIds.Air:
      case BlockIds.WaterFlowing:
      case BlockIds.WaterStill:
      case BlockIds.LavaFlowing:
      case BlockIds.LavaStill:
      case BlockIds.Fire:
      case BlockIds.Snow:
      case BlockIds.Ice:
        return false;
      default:
        return true;
    }
  }

  /**
   * Gets a block from the raw array using XZY layout.
   */
  private getBlock(blocks: Uint8Array, x: number, y: number, z: number): number {
    if (y < 0 || y >= CHUNK_SIZE_Y) return 0;
    return blocks[x + z * CHUNK_SIZE_X + y * CHUNK_SIZE_X * CHUNK_SIZE_Z] ?? 0;
  }

  /**
   * Sets a block in the raw array using XZY layout.
   */
  private setBlock(blocks: Uint8Array, x: number, y: number, z: number, blockId: number): void {
    if (y < 0 || y >= CHUNK_SIZE_Y) return;
    blocks[x + z * CHUNK_SIZE_X + y * CHUNK_SIZE_X * CHUNK_SIZE_Z] = blockId;
  }
}
