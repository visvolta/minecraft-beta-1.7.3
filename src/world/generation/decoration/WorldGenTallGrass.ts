import type { TreeWorldAccessor } from '../trees/TreeWorldAccessor';
import type { JavaRandom } from '../random/JavaRandom';
import { BlockIds } from '../../../blocks/BlockId';
import { TALL_GRASS_META_GRASS } from '../../../blocks/TallGrassMeta';

/**
 * Faithful port of Beta 1.7.3 WorldGenTallGrass (block id + metadata).
 * meta 1 = tall grass, meta 2 = fern.
 */
export class WorldGenTallGrass {
  public constructor(
    private readonly blockId: number,
    private readonly metadata: number = TALL_GRASS_META_GRASS,
  ) {}

  public generate(world: TreeWorldAccessor, random: JavaRandom, x: number, y: number, z: number): boolean {
    let yy = y;
    for (;;) {
      const id = world.getBlock(x, yy, z);
      if (
        (id === 0 ||
          id === BlockIds.Leaves ||
          id === BlockIds.SpruceLeaves ||
          id === BlockIds.BirchLeaves) &&
        yy > 0
      ) {
        yy--;
        continue;
      }
      break;
    }

    for (let i = 0; i < 128; i++) {
      const bx = x + random.nextInt(8) - random.nextInt(8);
      const by = yy + random.nextInt(4) - random.nextInt(4);
      const bz = z + random.nextInt(8) - random.nextInt(8);
      if (by < 0 || by >= 128) continue;
      if (world.getBlock(bx, by, bz) !== 0) continue;
      const below = world.getBlock(bx, by - 1, bz);
      if (below === BlockIds.Grass || below === BlockIds.Dirt || below === BlockIds.Podzol) {
        if (world.setBlockWithMetadata) {
          world.setBlockWithMetadata(bx, by, bz, this.blockId, this.metadata);
        } else {
          world.setBlock(bx, by, bz, this.blockId);
          world.setBlockMetadata?.(bx, by, bz, this.metadata);
        }
      }
    }
    return true;
  }
}
