import type { TreeWorldAccessor } from '../trees/TreeWorldAccessor';
import type { JavaRandom } from '../random/JavaRandom';
import { BlockIds } from '../../../blocks/BlockId';

/**
 * Faithful port of Beta 1.7.3's WorldGenCactus.
 * Places cactus pillars on Sand, ensuring no solid adjacent neighbors are present.
 */
export class WorldGenCactus {
  private readonly blockId: number;

  public constructor(blockId: number) {
    this.blockId = blockId;
  }

  public generate(world: TreeWorldAccessor, random: JavaRandom, x: number, y: number, z: number): boolean {
    for (let l = 0; l < 10; ++l) {
      const bx = x + random.nextInt(8) - random.nextInt(8);
      const by = y + random.nextInt(4) - random.nextInt(4);
      const bz = z + random.nextInt(8) - random.nextInt(8);

      if (by >= 0 && by < 128 && world.getBlock(bx, by, bz) === 0) {
        const belowBlockId = world.getBlock(bx, by - 1, bz);

        // Cactus can only be placed on Sand
        if (belowBlockId === BlockIds.Sand) {
          const height = 1 + random.nextInt(random.nextInt(3) + 1); // 1 to 3 blocks high
          for (let h = 0; h < height; ++h) {
            const cy = by + h;
            if (cy >= 128) {
              break;
            }

            // Cactus must not be horizontally adjacent to any solid/non-air blocks at its height level
            const hasSolidNeighbor =
              world.getBlock(bx - 1, cy, bz) !== 0 ||
              world.getBlock(bx + 1, cy, bz) !== 0 ||
              world.getBlock(bx, cy, bz - 1) !== 0 ||
              world.getBlock(bx, cy, bz + 1) !== 0;

            if (!hasSolidNeighbor && world.getBlock(bx, cy, bz) === 0) {
              world.setBlock(bx, cy, bz, this.blockId);
            }
          }
        }
      }
    }

    return true;
  }
}
