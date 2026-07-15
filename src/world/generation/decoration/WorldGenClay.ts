import type { TreeWorldAccessor } from '../trees/TreeWorldAccessor';
import type { JavaRandom } from '../random/JavaRandom';
import { BlockIds } from '../../../blocks/BlockId';

/**
 * Faithful port of Beta 1.7.3's WorldGenClay.
 * Places clay discs underwater, replacing Dirt or Sand.
 */
export class WorldGenClay {
  private readonly numberOfBlocks: number;

  public constructor(numberOfBlocks: number) {
    this.numberOfBlocks = numberOfBlocks;
  }

  public generate(world: TreeWorldAccessor, random: JavaRandom, x: number, y: number, z: number): boolean {
    const targetBlock = world.getBlock(x, y, z);
    // Target block must be Water (ID 9) or Water flowing/still (though terrain generates stationary water)
    if (targetBlock !== BlockIds.Water) {
      return false;
    }

    const radius = random.nextInt(this.numberOfBlocks - 2) + 2;
    const depth = 1;

    for (let bx = x - radius; bx <= x + radius; bx++) {
      for (let bz = z - radius; bz <= z + radius; bz++) {
        const dx = bx - x;
        const dz = bz - z;
        if (dx * dx + dz * dz <= radius * radius) {
          for (let by = y - depth; by <= y + depth; by++) {
            const blockId = world.getBlock(bx, by, bz);
            if (blockId === BlockIds.Dirt || blockId === BlockIds.Sand) {
              world.setBlock(bx, by, bz, BlockIds.Clay);
            }
          }
        }
      }
    }

    return true;
  }
}
