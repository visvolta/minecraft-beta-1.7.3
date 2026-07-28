import type { TreeWorldAccessor } from '../trees/TreeWorldAccessor';
import type { JavaRandom } from '../random/JavaRandom';
import { BlockIds } from '../../../blocks/BlockId';

/**
 * Faithful port of Beta 1.7.3 WorldGenLiquids (water/lava springs).
 */
export class WorldGenLiquids {
  public constructor(private readonly liquidBlockId: number) {}

  public generate(world: TreeWorldAccessor, _random: JavaRandom, x: number, y: number, z: number): boolean {
    if (world.getBlock(x, y + 1, z) !== BlockIds.Stone) return false;
    if (world.getBlock(x, y - 1, z) !== BlockIds.Stone) return false;
    const here = world.getBlock(x, y, z);
    if (here !== 0 && here !== BlockIds.Stone) return false;

    let stoneSides = 0;
    if (world.getBlock(x - 1, y, z) === BlockIds.Stone) stoneSides++;
    if (world.getBlock(x + 1, y, z) === BlockIds.Stone) stoneSides++;
    if (world.getBlock(x, y, z - 1) === BlockIds.Stone) stoneSides++;
    if (world.getBlock(x, y, z + 1) === BlockIds.Stone) stoneSides++;

    let airSides = 0;
    if (world.getBlock(x - 1, y, z) === 0) airSides++;
    if (world.getBlock(x + 1, y, z) === 0) airSides++;
    if (world.getBlock(x, y, z - 1) === 0) airSides++;
    if (world.getBlock(x, y, z + 1) === 0) airSides++;

    if (stoneSides === 3 && airSides === 1) {
      world.setBlock(x, y, z, this.liquidBlockId);
    }
    return true;
  }
}
