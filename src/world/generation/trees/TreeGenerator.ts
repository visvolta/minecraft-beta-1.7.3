import { BlockIds } from '../../../blocks/BlockId';
import type { JavaRandom } from '../random/JavaRandom';
import type { TreeWorldAccessor } from './TreeWorldAccessor.ts';
import { isNonOpaque } from './TreeWorldAccessor.ts';

/**
 * Faithful port of Beta 1.7.3's WorldGenTrees ("regular" Oak tree),
 * verified directly against unmodified mc-dev source and cross-checked
 * against Project-Poseidon's WorldGenTrees.java (behaviourally
 * identical, only decompiler naming/formatting differs — Poseidon
 * additionally checks a `leafDecayBlacklist`, which does not exist in
 * mc-dev and is skipped here since leaf decay is out of scope for this
 * stage per the "Do Not Implement" list).
 *
 * Algorithm: height 4-6 (`4 + nextInt(3)`); validates a column of
 * space (radius 0 at the base, 1 through the trunk, 2 near the very
 * top) is entirely Air/Leaves before placing anything; requires
 * Grass/Dirt directly beneath, which is set to Dirt; three tapering
 * leaf "pancake" rings near the top (with the widest ring having a
 * random per-cell skip chance) only ever overwrite non-opaque
 * (`Block.o[]==false`) cells; the trunk then fills any Air/Leaves cell
 * in its own column bottom-to-top with Log.
 */
export class TreeGenerator {
  /**
   * Attempts to generate one Oak tree with its base at world (x, y, z)
   * (y = the block the trunk's bottom-most log occupies). Returns true
   * if the tree was placed, false if space/ground validation failed
   * (nothing is written in that case, matching the source exactly).
   */
  public generate(world: TreeWorldAccessor, random: JavaRandom, x: number, y: number, z: number): boolean {
    const height = random.nextInt(3) + 4;

    if (y < 1 || y + height + 1 > 128) {
      return false;
    }

    let spaceValid = true;

    for (let checkY = y; checkY <= y + 1 + height && spaceValid; checkY++) {
      let radius = 1;

      if (checkY === y) {
        radius = 0;
      }
      if (checkY >= y + 1 + height - 2) {
        radius = 2;
      }

      for (let checkX = x - radius; checkX <= x + radius && spaceValid; checkX++) {
        for (let checkZ = z - radius; checkZ <= z + radius && spaceValid; checkZ++) {
          if (checkY >= 0 && checkY < 128) {
            const existing = world.getBlock(checkX, checkY, checkZ);

            if (existing !== 0 && existing !== BlockIds.Leaves) {
              spaceValid = false;
            }
          } else {
            spaceValid = false;
          }
        }
      }
    }

    if (!spaceValid) {
      return false;
    }

    const belowBlock = world.getBlock(x, y - 1, z);

    if ((belowBlock !== BlockIds.Grass && belowBlock !== BlockIds.Dirt) || y >= 128 - height - 1) {
      return false;
    }

    world.setBlock(x, y - 1, z, BlockIds.Dirt);

    for (let leafY = y - 3 + height; leafY <= y + height; leafY++) {
      const ringOffset = leafY - (y + height);
      const ringRadius = 1 - Math.trunc(ringOffset / 2);

      for (let leafX = x - ringRadius; leafX <= x + ringRadius; leafX++) {
        const dx = leafX - x;

        for (let leafZ = z - ringRadius; leafZ <= z + ringRadius; leafZ++) {
          const dz = leafZ - z;

          // Source: `(Math.abs(l3) != i3 || Math.abs(j4) != i3 ||
          // random.nextInt(2) != 0 && j2 != 0) && !Block.o[...]`. Java
          // operator precedence: `&&` binds tighter than `||`, so the
          // right operand of the outer `||` chain is
          // `(random.nextInt(2) != 0 && ringOffset != 0)`, not
          // `(... || random.nextInt(2) != 0) && ringOffset != 0`.
          // random.nextInt(2) is only evaluated (consuming RNG state)
          // when neither Math.abs check already makes the condition
          // true, matching Java's short-circuit evaluation exactly.
          const isCorner = Math.abs(dx) === ringRadius && Math.abs(dz) === ringRadius;
          const placeLeaf =
            !isCorner || (random.nextInt(2) !== 0 && ringOffset !== 0);

          if (placeLeaf && isNonOpaque(world.getBlock(leafX, leafY, leafZ))) {
            world.setBlock(leafX, leafY, leafZ, BlockIds.Leaves);
          }
        }
      }
    }

    for (let trunkY = 0; trunkY < height; trunkY++) {
      const existing = world.getBlock(x, y + trunkY, z);

      if (existing === 0 || existing === BlockIds.Leaves) {
        world.setBlock(x, y + trunkY, z, BlockIds.Log);
      }
    }

    return true;
  }
}
