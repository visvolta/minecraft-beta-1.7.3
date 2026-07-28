import type { TreeWorldAccessor } from '../trees/TreeWorldAccessor';
import type { JavaRandom } from '../random/JavaRandom';
import { BlockIds } from '../../../blocks/BlockId';

/** Faithful port of Beta 1.7.3 WorldGenCactus. */
export class WorldGenCactus {
  public generate(world: TreeWorldAccessor, random: JavaRandom, x: number, y: number, z: number): boolean {
    for (let i = 0; i < 10; i++) {
      const bx = x + random.nextInt(8) - random.nextInt(8);
      const by = y + random.nextInt(4) - random.nextInt(4);
      const bz = z + random.nextInt(8) - random.nextInt(8);
      if (by < 0 || by >= 128) continue;
      if (world.getBlock(bx, by, bz) !== 0) continue;
      if (world.getBlock(bx, by - 1, bz) !== BlockIds.Sand) continue;

      const height = 1 + random.nextInt(random.nextInt(3) + 1);
      for (let h = 0; h < height; h++) {
        const cy = by + h;
        if (cy >= 128) break;
        if (world.getBlock(bx, cy, bz) !== 0) break;
        // No horizontal solid neighbours.
        if (
          world.getBlock(bx - 1, cy, bz) !== 0 ||
          world.getBlock(bx + 1, cy, bz) !== 0 ||
          world.getBlock(bx, cy, bz - 1) !== 0 ||
          world.getBlock(bx, cy, bz + 1) !== 0
        ) {
          break;
        }
        world.setBlock(bx, cy, bz, BlockIds.Cactus);
      }
    }
    return true;
  }
}
