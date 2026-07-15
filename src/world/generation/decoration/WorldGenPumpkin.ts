import type { TreeWorldAccessor } from '../trees/TreeWorldAccessor';
import type { JavaRandom } from '../random/JavaRandom';
import { BlockIds } from '../../../blocks/BlockId';

/**
 * Faithful port of Beta 1.7.3's WorldGenPumpkin.
 * Places pumpkin patches on Grass blocks.
 */
export class WorldGenPumpkin {
  private readonly blockId: number;

  public constructor(blockId: number) {
    this.blockId = blockId;
  }

  public generate(world: TreeWorldAccessor, random: JavaRandom, x: number, y: number, z: number): boolean {
    for (let l = 0; l < 64; ++l) {
      const bx = x + random.nextInt(8) - random.nextInt(8);
      const by = y + random.nextInt(4) - random.nextInt(4);
      const bz = z + random.nextInt(8) - random.nextInt(8);

      if (by >= 0 && by < 128 && world.getBlock(bx, by, bz) === 0) {
        const belowBlockId = world.getBlock(bx, by - 1, bz);
        if (belowBlockId === BlockIds.Grass) {
          world.setBlock(bx, by, bz, this.blockId);
        }
      }
    }

    return true;
  }
}
