import { BlockIds } from '../../../blocks/BlockId';
import type { JavaRandom } from '../random/JavaRandom';
import type { TreeWorldAccessor } from './TreeWorldAccessor';
import { isNonOpaque } from './TreeWorldAccessor';

/**
 * Faithful port of Project-Poseidon's WorldGenTaiga1 (a narrow, tall
 * spruce/pine tree shape). Disclosed per this stage's approved plan:
 * `mc-dev` (primary source of truth) has NO equivalent class anywhere —
 * WorldGenTaiga1/WorldGenTaiga2 exist only in Project-Poseidon
 * (secondary reference), used here specifically because you approved
 * including Taiga-specific tree shapes despite the primary source
 * lacking them, since Spruce wood/leaves are themselves confirmed
 * genuine Beta content (added Beta 1.2, predating 1.7.3).
 *
 * Deliberate omission, disclosed: Poseidon's source additionally checks
 * `Block.leafDecayBlacklist` before placing each leaf cell — a
 * CraftBukkit-specific addition unrelated to authentic Beta generation,
 * and explicitly out of scope since leaf decay is on this stage's
 * "Do Not Implement" list. Omitted cleanly rather than ported.
 *
 * Species uses Spruce log/leaves (this project's SpruceLog/SpruceLeaves
 * ids), matching this project's Taiga-biome wood species, not Oak.
 */
export class TaigaTree1Generator {
  public generate(world: TreeWorldAccessor, random: JavaRandom, x: number, y: number, z: number): boolean {
    const height = random.nextInt(5) + 7;
    const trunkTopMargin = height - random.nextInt(2) - 3;
    const crownDepth = height - trunkTopMargin;
    const maxCrownRadius = 1 + random.nextInt(crownDepth + 1);

    if (y < 1 || y + height + 1 > 128) {
      return false;
    }

    let spaceValid = true;

    for (let checkY = y; checkY <= y + 1 + height && spaceValid; checkY++) {
      const radius = checkY - y < trunkTopMargin ? 0 : maxCrownRadius;

      for (let checkX = x - radius; checkX <= x + radius && spaceValid; checkX++) {
        for (let checkZ = z - radius; checkZ <= z + radius && spaceValid; checkZ++) {
          if (checkY >= 0 && checkY < 128) {
            const existing = world.getBlock(checkX, checkY, checkZ);

            if (existing !== 0 && existing !== BlockIds.SpruceLeaves) {
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

    let ringRadius = 0;

    for (let leafY = y + height; leafY >= y + trunkTopMargin; leafY--) {
      for (let leafX = x - ringRadius; leafX <= x + ringRadius; leafX++) {
        const dx = leafX - x;

        for (let leafZ = z - ringRadius; leafZ <= z + ringRadius; leafZ++) {
          const dz = leafZ - z;

          const isCorner = Math.abs(dx) === ringRadius && Math.abs(dz) === ringRadius;

          if ((!isCorner || ringRadius <= 0) && isNonOpaque(world.getBlock(leafX, leafY, leafZ))) {
            world.setBlock(leafX, leafY, leafZ, BlockIds.SpruceLeaves);
          }
        }
      }

      if (ringRadius >= 1 && leafY === y + trunkTopMargin + 1) {
        ringRadius--;
      } else if (ringRadius < maxCrownRadius) {
        ringRadius++;
      }
    }

    for (let trunkY = 0; trunkY < height - 1; trunkY++) {
      const existing = world.getBlock(x, y + trunkY, z);

      if (existing === 0 || existing === BlockIds.SpruceLeaves) {
        world.setBlock(x, y + trunkY, z, BlockIds.SpruceLog);
      }
    }

    return true;
  }
}
