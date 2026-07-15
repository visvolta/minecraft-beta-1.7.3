import type { TreeWorldAccessor } from '../trees/TreeWorldAccessor';
import type { JavaRandom } from '../random/JavaRandom';
import { BlockIds } from '../../../blocks/BlockId';

/**
 * Faithful port of Beta 1.7.3's WorldGenTallGrass.
 * Places clusters of tall grass and ferns.
 */
export class WorldGenTallGrass {
  private readonly blockId: number;

  public constructor(blockId: number) {
    this.blockId = blockId;
  }

  public generate(world: TreeWorldAccessor, random: JavaRandom, x: number, y: number, z: number): boolean {
    let startY = y;

    // Scan down through air/leaves to find soil
    while (startY > 0) {
      const blockId = world.getBlock(x, startY, z);
      if (blockId !== 0 && blockId !== BlockIds.Leaves && blockId !== BlockIds.SpruceLeaves) {
        break;
      }
      startY--;
    }

    for (let l = 0; l < 128; ++l) {
      const bx = x + random.nextInt(8) - random.nextInt(8);
      const by = startY + random.nextInt(4) - random.nextInt(4);
      const bz = z + random.nextInt(8) - random.nextInt(8);

      if (by >= 0 && by < 128 && world.getBlock(bx, by, bz) === 0) {
        const belowBlockId = world.getBlock(bx, by - 1, bz);
        if (belowBlockId === BlockIds.Grass || belowBlockId === BlockIds.Dirt) {
          world.setBlock(bx, by, bz, this.blockId);
        }
      }
    }

    return true;
  }
}
