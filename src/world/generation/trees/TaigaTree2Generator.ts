import { BlockIds } from '../../../blocks/BlockId';
import type { JavaRandom } from '../random/JavaRandom';
import type { TreeWorldAccessor } from './TreeWorldAccessor.ts';
import { isNonOpaque } from './TreeWorldAccessor.ts';

/**
 * Faithful port of Project-Poseidon's WorldGenTaiga2 (a second,
 * shorter/stockier spruce/pine variant with a distinctive staggered
 * leaf-ring pattern, alternating narrow/wide rings as it descends from
 * the top). Disclosed per this stage's approved plan: `mc-dev` (primary
 * source of truth) has NO equivalent class anywhere — see
 * TaigaTree1Generator's doc comment for the full rationale; the same
 * applies here.
 *
 * Deliberate omission, disclosed: Poseidon's source additionally checks
 * `Block.leafDecayBlacklist` before placing each leaf cell — a
 * CraftBukkit-specific addition unrelated to authentic Beta generation,
 * out of scope since leaf decay is on this stage's "Do Not Implement"
 * list. Omitted cleanly rather than ported.
 *
 * Species uses Spruce log/leaves, matching this project's Taiga-biome
 * wood species, not Oak.
 */
export class TaigaTree2Generator {
  public generate(world: TreeWorldAccessor, random: JavaRandom, x: number, y: number, z: number): boolean {
    const height = random.nextInt(4) + 6;
    const trunkTopMargin = 1 + random.nextInt(2);
    const ringPassCount = height - trunkTopMargin;
    const maxCrownRadius = 2 + random.nextInt(2);

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

    // Staggered ring-radius state machine, matching the source exactly:
    // ringRadius starts random (0 or 1), stepUpTo tracks the current
    // "reset ceiling" (starts at 1, becomes 1 again after the first
    // reset — see nextResetCeiling below), and nextResetCeiling
    // alternates 0/1 each time a reset happens.
    let ringRadius = random.nextInt(2);
    let stepUpTo = 1;
    let nextResetCeiling = 0;

    for (let pass = 0; pass <= ringPassCount; pass++) {
      const leafY = y + height - pass;

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

      if (ringRadius >= stepUpTo) {
        ringRadius = nextResetCeiling;
        nextResetCeiling = 1;
        stepUpTo++;
        if (stepUpTo > maxCrownRadius) {
          stepUpTo = maxCrownRadius;
        }
      } else {
        ringRadius++;
      }
    }

    const trunkTopSkip = random.nextInt(3);

    for (let trunkY = 0; trunkY < height - trunkTopSkip; trunkY++) {
      const existing = world.getBlock(x, y + trunkY, z);

      if (existing === 0 || existing === BlockIds.SpruceLeaves) {
        world.setBlock(x, y + trunkY, z, BlockIds.SpruceLog);
      }
    }

    return true;
  }
}
