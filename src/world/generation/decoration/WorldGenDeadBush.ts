import type { TreeWorldAccessor } from '../trees/TreeWorldAccessor';
import type { JavaRandom } from '../random/JavaRandom';
import { BlockIds } from '../../../blocks/BlockId';

/** Faithful port of Beta 1.7.3 WorldGenDeadBush. */
export class WorldGenDeadBush {
  public constructor(private readonly blockId: number) {}

  public generate(world: TreeWorldAccessor, random: JavaRandom, x: number, y: number, z: number): boolean {
    let yy = y;
    for (;;) {
      const id = world.getBlock(x, yy, z);
      if ((id === 0 || id === BlockIds.Leaves || id === BlockIds.SpruceLeaves || id === BlockIds.BirchLeaves) && yy > 0) {
        yy--;
        continue;
      }
      break;
    }

    for (let i = 0; i < 4; i++) {
      const bx = x + random.nextInt(8) - random.nextInt(8);
      const by = yy + random.nextInt(4) - random.nextInt(4);
      const bz = z + random.nextInt(8) - random.nextInt(8);
      if (by < 0 || by >= 128) continue;
      if (world.getBlock(bx, by, bz) !== 0) continue;
      const below = world.getBlock(bx, by - 1, bz);
      // Beta dead bush stays on sand only (BlockDeadBush.canThisPlantGrowOnThisBlockID).
      if (below === BlockIds.Sand) {
        world.setBlock(bx, by, bz, this.blockId);
      }
    }
    return true;
  }
}
