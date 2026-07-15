import type { TreeWorldAccessor } from '../trees/TreeWorldAccessor';
import type { JavaRandom } from '../random/JavaRandom';
import { BlockIds } from '../../../blocks/BlockId';

/**
 * Faithful port of Beta 1.7.3's WorldGenFlowers.
 * Places clusters of flowers (Yellow/Red) or mushrooms (Brown/Red) or dead bushes.
 */
export class WorldGenFlowers {
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

        let canPlace = false;
        if (this.blockId === BlockIds.Dandelion || this.blockId === BlockIds.Rose) {
          canPlace = belowBlockId === BlockIds.Grass || belowBlockId === BlockIds.Dirt;
        } else if (this.blockId === BlockIds.BrownMushroom || this.blockId === BlockIds.RedMushroom) {
          canPlace = belowBlockId !== 0 && belowBlockId !== BlockIds.Water && belowBlockId !== BlockIds.Lava && belowBlockId !== BlockIds.LavaStill;
        } else if (this.blockId === BlockIds.DeadBush) {
          canPlace = belowBlockId === BlockIds.Sand || belowBlockId === BlockIds.Dirt;
        }

        if (canPlace) {
          world.setBlock(bx, by, bz, this.blockId);
        }
      }
    }

    return true;
  }
}
