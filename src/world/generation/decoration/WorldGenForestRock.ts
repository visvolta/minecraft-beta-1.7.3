import type { TreeWorldAccessor } from '../trees/TreeWorldAccessor';
import type { JavaRandom } from '../random/JavaRandom';
import { BlockIds } from '../../../blocks/BlockId';

/**
 * Intentional OGST mossy-cobblestone boulder (modern forest-rock analogue).
 * Small blob; horizontal radius ≤ 3.
 */
export class WorldGenForestRock {
  public generate(world: TreeWorldAccessor, random: JavaRandom, x: number, y: number, z: number): boolean {
    // Sink to surface
    let yy = y;
    while (yy > 0 && world.getBlock(x, yy, z) === 0) yy--;
    if (yy <= 0) return false;
    const ground = world.getBlock(x, yy, z);
    if (
      ground !== BlockIds.Grass &&
      ground !== BlockIds.Dirt &&
      ground !== BlockIds.Podzol &&
      ground !== BlockIds.CoarseDirt &&
      ground !== BlockIds.Stone
    ) {
      return false;
    }

    const radius = 1 + random.nextInt(2); // 1–2
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = 0; dy <= radius; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (dx * dx + dy * dy + dz * dz > radius * radius + random.nextInt(2)) continue;
          const bx = x + dx;
          const by = yy + dy;
          const bz = z + dz;
          if (by <= 0 || by >= 128) continue;
          const existing = world.getBlock(bx, by, bz);
          if (
            existing === 0 ||
            existing === BlockIds.Grass ||
            existing === BlockIds.Dirt ||
            existing === BlockIds.Podzol ||
            existing === BlockIds.CoarseDirt ||
            existing === BlockIds.Snow
          ) {
            world.setBlock(bx, by, bz, BlockIds.MossyCobblestone);
          }
        }
      }
    }
    return true;
  }
}
