import type { TreeWorldAccessor } from '../trees/TreeWorldAccessor';
import type { JavaRandom } from '../random/JavaRandom';
import { BlockIds } from '../../../blocks/BlockId';

/**
 * Faithful port of Beta 1.7.3's WorldGenDungeons.
 * Generates cobblestone and mossy cobblestone rooms with a central spawner and chest blocks.
 */
export class WorldGenDungeons {
  public generate(world: TreeWorldAccessor, random: JavaRandom, x: number, y: number, z: number): boolean {
    const heightLimit = 3; // room height factor
    const radiusX = random.nextInt(2) + 2;
    const radiusZ = random.nextInt(2) + 2;
    let openingsCount = 0;

    // First scan: validate the surrounding block solid/air ratios
    for (let cx = x - radiusX - 1; cx <= x + radiusX + 1; ++cx) {
      for (let cy = y - 1; cy <= y + heightLimit + 1; ++cy) {
        for (let cz = z - radiusZ - 1; cz <= z + radiusZ + 1; ++cz) {
          const blockId = world.getBlock(cx, cy, cz);
          const isSolid = blockId !== 0 && blockId !== BlockIds.Water && blockId !== BlockIds.Lava && blockId !== BlockIds.LavaStill;

          // Dungeon ceiling and floor must be anchored to solid blocks
          if (cy === y - 1 && !isSolid) {
            return false;
          }
          if (cy === y + heightLimit + 1 && !isSolid) {
            return false;
          }

          // Count adjacent air openings (dungeons generate adjacent to caves)
          const isWallX = cx === x - radiusX - 1 || cx === x + radiusX + 1;
          const isWallZ = cz === z - radiusZ - 1 || cz === z + radiusZ + 1;
          if ((isWallX || isWallZ) && cy === y && world.getBlock(cx, cy, cz) === 0 && world.getBlock(cx, cy + 1, cz) === 0) {
            ++openingsCount;
          }
        }
      }
    }

    // Must have between 1 and 5 cave openings
    if (openingsCount < 1 || openingsCount > 5) {
      return false;
    }

    // Second scan: carve room and place wall/floor cobble
    for (let cx = x - radiusX - 1; cx <= x + radiusX + 1; ++cx) {
      for (let cy = y + heightLimit + 1; cy >= y - 1; --cy) {
        for (let cz = z - radiusZ - 1; cz <= z + radiusZ + 1; ++cz) {
          const isWallX = cx === x - radiusX - 1 || cx === x + radiusX + 1;
          const isWallY = cy === y - 1 || cy === y + heightLimit + 1;
          const isWallZ = cz === z - radiusZ - 1 || cz === z + radiusZ + 1;

          if (isWallX || isWallY || isWallZ) {
            // Underworld support: check blocks below aren't air
            if (cy >= 0 && world.getBlock(cx, cy - 1, cz) === 0) {
              world.setBlock(cx, cy, cz, 0); // Air
            } else {
              const currentBlock = world.getBlock(cx, cy, cz);
              // Walls/floor become cobblestone or mossy cobblestone
              if (currentBlock !== 0 && currentBlock !== BlockIds.Bedrock) {
                if (cy === y - 1 || random.nextInt(4) === 0) {
                  world.setBlock(cx, cy, cz, BlockIds.MossyCobblestone);
                } else {
                  world.setBlock(cx, cy, cz, BlockIds.Cobblestone);
                }
              }
            }
          } else {
            // Room interior is carved to Air
            world.setBlock(cx, cy, cz, 0);
          }
        }
      }
    }

    // Place up to 2 chests
    for (let attempt = 0; attempt < 2; ++attempt) {
      for (let chestTry = 0; chestTry < 3; ++chestTry) {
        const cx = x + random.nextInt(radiusX * 2 + 1) - radiusX;
        const cz = z + random.nextInt(radiusZ * 2 + 1) - radiusZ;

        if (world.getBlock(cx, y, cz) === 0) {
          let adjWallCount = 0;
          if (world.getBlock(cx - 1, y, cz) !== 0) ++adjWallCount;
          if (world.getBlock(cx + 1, y, cz) !== 0) ++adjWallCount;
          if (world.getBlock(cx, y, cz - 1) !== 0) ++adjWallCount;
          if (world.getBlock(cx, y, cz + 1) !== 0) ++adjWallCount;

          // Chest must be placed next to exactly 1 wall block
          if (adjWallCount === 1) {
            world.setBlock(cx, y, cz, BlockIds.Chest);
            break;
          }
        }
      }
    }

    // Place the Mob Spawner block in the exact center of the room
    world.setBlock(x, y, z, BlockIds.Spawner);

    return true;
  }
}
