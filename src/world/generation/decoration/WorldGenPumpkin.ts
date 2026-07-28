import type { TreeWorldAccessor } from '../trees/TreeWorldAccessor';
import type { JavaRandom } from '../random/JavaRandom';
import { BlockIds } from '../../../blocks/BlockId';

/** Faithful port of Beta 1.7.3 WorldGenPumpkin. */
export class WorldGenPumpkin {
  public generate(world: TreeWorldAccessor, random: JavaRandom, x: number, y: number, z: number): boolean {
    for (let i = 0; i < 64; i++) {
      const bx = x + random.nextInt(8) - random.nextInt(8);
      const by = y + random.nextInt(4) - random.nextInt(4);
      const bz = z + random.nextInt(8) - random.nextInt(8);
      if (by < 0 || by >= 128) continue;
      if (world.getBlock(bx, by, bz) !== 0) continue;
      if (world.getBlock(bx, by - 1, bz) !== BlockIds.Grass) continue;
      // Beta also sets random horizontal facing metadata 0-3.
      const facing = random.nextInt(4);
      if (world.setBlockWithMetadata) {
        world.setBlockWithMetadata(bx, by, bz, BlockIds.Pumpkin, facing);
      } else {
        world.setBlock(bx, by, bz, BlockIds.Pumpkin);
        world.setBlockMetadata?.(bx, by, bz, facing);
      }
    }
    return true;
  }
}
