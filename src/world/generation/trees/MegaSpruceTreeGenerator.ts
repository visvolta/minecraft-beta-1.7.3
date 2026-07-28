import { BlockIds } from '../../../blocks/BlockId';
import type { JavaRandom } from '../random/JavaRandom';
import type { TreeWorldAccessor } from './TreeWorldAccessor';
import { isNonOpaque } from './TreeWorldAccessor';

/**
 * Intentional non-Beta generator: large 2×2 spruce for Old Growth Spruce Taiga.
 * Inspired by modern mega spruce silhouette but kept simple for Beta-style worlds.
 *
 * Horizontal reach: trunk 2×2, canopy radius up to 4 → about 5 blocks from origin.
 */
export class MegaSpruceTreeGenerator {
  public generate(world: TreeWorldAccessor, random: JavaRandom, x: number, y: number, z: number): boolean {
    const height = 15 + random.nextInt(15); // 15–29
    const crownStart = y + Math.floor(height * 0.45);
    if (y < 1 || y + height + 2 >= 128) return false;

    // Ground: all four trunk feet on grass/dirt/podzol/coarse dirt.
    for (let dx = 0; dx < 2; dx++) {
      for (let dz = 0; dz < 2; dz++) {
        const soil = world.getBlock(x + dx, y - 1, z + dz);
        if (
          soil !== BlockIds.Grass &&
          soil !== BlockIds.Dirt &&
          soil !== BlockIds.Podzol &&
          soil !== BlockIds.CoarseDirt
        ) {
          return false;
        }
      }
    }

    // Space check
    for (let yy = y; yy <= y + height + 1; yy++) {
      const radius = yy < crownStart ? 1 : 4;
      for (let xx = x - radius; xx <= x + 1 + radius; xx++) {
        for (let zz = z - radius; zz <= z + 1 + radius; zz++) {
          if (yy < 0 || yy >= 128) return false;
          const b = world.getBlock(xx, yy, zz);
          if (b !== 0 && b !== BlockIds.SpruceLeaves && b !== BlockIds.Leaves) return false;
        }
      }
    }

    // Soil under trunk → dirt/podzol
    for (let dx = 0; dx < 2; dx++) {
      for (let dz = 0; dz < 2; dz++) {
        world.setBlock(x + dx, y - 1, z + dz, BlockIds.Podzol);
      }
    }

    // Trunk 2×2
    for (let yy = 0; yy < height; yy++) {
      for (let dx = 0; dx < 2; dx++) {
        for (let dz = 0; dz < 2; dz++) {
          const existing = world.getBlock(x + dx, y + yy, z + dz);
          if (existing === 0 || existing === BlockIds.SpruceLeaves) {
            world.setBlock(x + dx, y + yy, z + dz, BlockIds.SpruceLog);
          }
        }
      }
    }

    // Layered canopy
    for (let yy = crownStart; yy <= y + height; yy++) {
      const distFromTop = y + height - yy;
      const radius = Math.min(4, 1 + Math.floor(distFromTop / 2));
      const centerX = x + 0.5;
      const centerZ = z + 0.5;
      for (let xx = x - radius; xx <= x + 1 + radius; xx++) {
        for (let zz = z - radius; zz <= z + 1 + radius; zz++) {
          const dx = xx - centerX;
          const dz = zz - centerZ;
          if (dx * dx + dz * dz > (radius + 0.5) * (radius + 0.5)) continue;
          if (Math.abs(dx) === radius && Math.abs(dz) === radius && random.nextInt(2) === 0) continue;
          if (isNonOpaque(world.getBlock(xx, yy, zz))) {
            world.setBlock(xx, yy, zz, BlockIds.SpruceLeaves);
          }
        }
      }
    }

    // Top point
    if (isNonOpaque(world.getBlock(x, y + height + 1, z))) {
      world.setBlock(x, y + height + 1, z, BlockIds.SpruceLeaves);
    }
    if (isNonOpaque(world.getBlock(x + 1, y + height + 1, z))) {
      world.setBlock(x + 1, y + height + 1, z, BlockIds.SpruceLeaves);
    }

    return true;
  }
}
