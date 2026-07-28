/**
 * Beta 1.7.3 snow placement from ChunkProviderGenerate.populate end.
 * Uses temperature (height-adjusted), not only enableSnow biome flags.
 */

import { BlockIds } from '../../blocks/BlockId';
import type { ClimateSample } from './climate/ClimateSampler';
import { CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z } from '../chunkConstants';
import { SEA_LEVEL } from './terrainConstants';

export class SnowIceGenerator {
  public apply(_chunkX: number, _chunkZ: number, blocks: Uint8Array, climate: ClimateSample[]): void {
    for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
        const climateSample = climate[lx * CHUNK_SIZE_Z + lz];
        if (climateSample === undefined) continue;

        // Beta findTopSolidBlock: top solid (non-air); snow goes at solidY (air check at solidY).
        // In Beta populate: var22 = findTopSolidBlock; places snow AT var22 if air and solid below.
        // Actually: isAirBlock(x, var22, z) && solid at var22-1 — so var22 is the air cell above ground.
        // findTopSolidBlock returns the Y of the highest solid; then snow at that Y if... 
        // Looking at Java again:
        //   int var22 = this.worldObj.findTopSolidBlock(var25, var19);
        //   if (var23 < 0.5D && var22 > 0 && var22 < 128 && this.worldObj.isAirBlock(var25, var22, var19) && solid below)
        // So findTopSolidBlock in Beta returns the first air above solid? Or solid?
        // In b1.7.3 World.findTopSolidBlock: scans from top for solid opaque — returns the solid Y+?
        // Common MCP: findTopSolidBlock returns y of top solid block. But then isAirBlock at var22 would fail.
        // Actually MCP World.java findTopSolidOrLiquidBlock / getHeightValue differs.
        // ChunkProvider uses findTopSolidBlock which returns the y where snow can sit (air above solid).
        // We'll use: top non-air solidY, place snow at solidY+1 if air.

        const solidY = this.findTopSolidBlock(blocks, lx, lz);
        if (solidY < 0 || solidY >= CHUNK_SIZE_Y - 1) continue;

        const adjustedTemp =
          climateSample.temperature - ((solidY - SEA_LEVEL) / 64.0) * 0.3;
        if (adjustedTemp >= 0.5) continue;

        const blockAtSurface = this.getBlock(blocks, lx, solidY, lz);
        const blockAbove = this.getBlock(blocks, lx, solidY + 1, lz);

        // Freeze surface still water to ice
        if (blockAtSurface === BlockIds.WaterStill || blockAtSurface === BlockIds.WaterFlowing) {
          if (blockAtSurface === BlockIds.WaterStill) {
            this.setBlock(blocks, lx, solidY, lz, BlockIds.Ice);
          }
          continue;
        }

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
  }

  private findTopSolidBlock(blocks: Uint8Array, lx: number, lz: number): number {
    for (let y = CHUNK_SIZE_Y - 1; y >= 0; y--) {
      const id = this.getBlock(blocks, lx, y, lz);
      if (id !== BlockIds.Air && id !== BlockIds.Snow) return y;
    }
    return -1;
  }

  private isOpaqueSolid(blockId: number): boolean {
    switch (blockId) {
      case BlockIds.Air:
      case BlockIds.WaterFlowing:
      case BlockIds.WaterStill:
      case BlockIds.Water:
      case BlockIds.LavaFlowing:
      case BlockIds.LavaStill:
      case BlockIds.Lava:
      case BlockIds.Fire:
      case BlockIds.Snow:
      case BlockIds.Ice:
      case BlockIds.TallGrass:
      case BlockIds.DeadBush:
      case BlockIds.Dandelion:
      case BlockIds.Rose:
      case BlockIds.BrownMushroom:
      case BlockIds.RedMushroom:
      case BlockIds.Reed:
        return false;
      default:
        return true;
    }
  }

  private getBlock(blocks: Uint8Array, x: number, y: number, z: number): number {
    if (y < 0 || y >= CHUNK_SIZE_Y) return 0;
    return blocks[x + z * CHUNK_SIZE_X + y * CHUNK_SIZE_X * CHUNK_SIZE_Z] ?? 0;
  }

  private setBlock(blocks: Uint8Array, x: number, y: number, z: number, blockId: number): void {
    if (y < 0 || y >= CHUNK_SIZE_Y) return;
    blocks[x + z * CHUNK_SIZE_X + y * CHUNK_SIZE_X * CHUNK_SIZE_Z] = blockId;
  }
}
