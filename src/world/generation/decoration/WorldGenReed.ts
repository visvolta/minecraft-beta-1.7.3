import type { TreeWorldAccessor } from '../trees/TreeWorldAccessor';
import type { JavaRandom } from '../random/JavaRandom';
import { BlockIds } from '../../../blocks/BlockId';

/**
 * Faithful port of Beta 1.7.3's WorldGenReed.
 * Places vertical stacks of Sugar Cane near water blocks.
 */
export class WorldGenReed {
  private readonly blockId: number;

  public constructor(blockId: number) {
    this.blockId = blockId;
  }

  public generate(world: TreeWorldAccessor, random: JavaRandom, x: number, y: number, z: number): boolean {
    for (let l = 0; l < 20; ++l) {
      const bx = x + random.nextInt(4) - random.nextInt(4);
      const bz = z + random.nextInt(4) - random.nextInt(4);
      const by = y;

      if (by >= 0 && by < 128 && world.getBlock(bx, by, bz) === 0) {
        const belowBlockId = world.getBlock(bx, by - 1, bz);
        
        // Reeds can be placed on Grass, Dirt, or Sand
        const isValidSoil = belowBlockId === BlockIds.Grass || belowBlockId === BlockIds.Dirt || belowBlockId === BlockIds.Sand;
        if (!isValidSoil) {
          continue;
        }

        // Must be adjacent to water horizontally at the soil level
        const hasWaterNeighbor =
          world.getBlock(bx - 1, by - 1, bz) === BlockIds.Water ||
          world.getBlock(bx + 1, by - 1, bz) === BlockIds.Water ||
          world.getBlock(bx, by - 1, bz - 1) === BlockIds.Water ||
          world.getBlock(bx, by - 1, bz + 1) === BlockIds.Water;

        if (hasWaterNeighbor) {
          const height = 2 + random.nextInt(random.nextInt(3) + 1); // 2 to 4 high
          for (let h = 0; h < height; ++h) {
            if (by + h < 128 && world.getBlock(bx, by + h, bz) === 0) {
              world.setBlock(bx, by + h, bz, this.blockId);
            }
          }
        }
      }
    }

    return true;
  }
}
