import type { TreeWorldAccessor } from '../trees/TreeWorldAccessor';
import type { JavaRandom } from '../random/JavaRandom';
import { BlockIds } from '../../../blocks/BlockId';

/** Faithful port of Beta 1.7.3 WorldGenReed. */
export class WorldGenReed {
  public generate(world: TreeWorldAccessor, random: JavaRandom, x: number, y: number, z: number): boolean {
    for (let i = 0; i < 20; i++) {
      const bx = x + random.nextInt(4) - random.nextInt(4);
      const bz = z + random.nextInt(4) - random.nextInt(4);
      if (world.getBlock(bx, y, bz) !== 0) continue;
      const below = world.getBlock(bx, y - 1, bz);
      if (below !== BlockIds.Grass && below !== BlockIds.Dirt && below !== BlockIds.Sand) continue;

      // Must be adjacent to water at the soil level.
      if (
        !isWater(world.getBlock(bx - 1, y - 1, bz)) &&
        !isWater(world.getBlock(bx + 1, y - 1, bz)) &&
        !isWater(world.getBlock(bx, y - 1, bz - 1)) &&
        !isWater(world.getBlock(bx, y - 1, bz + 1))
      ) {
        continue;
      }

      const height = 2 + random.nextInt(random.nextInt(3) + 1);
      for (let h = 0; h < height; h++) {
        // Beta canBlockStay: air column; we place if air.
        if (world.getBlock(bx, y + h, bz) === 0) {
          world.setBlock(bx, y + h, bz, BlockIds.Reed);
        }
      }
    }
    return true;
  }
}

function isWater(id: number): boolean {
  return id === BlockIds.Water || id === BlockIds.WaterStill || id === BlockIds.WaterFlowing;
}
