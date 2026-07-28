import type { TreeWorldAccessor } from '../trees/TreeWorldAccessor';
import type { JavaRandom } from '../random/JavaRandom';
import { BlockIds } from '../../../blocks/BlockId';

/**
 * Faithful port of Beta 1.7.3 WorldGenClay — ellipsoid sand→clay under water.
 */
export class WorldGenClay {
  private readonly clayBlockId = BlockIds.Clay;
  public constructor(private readonly numberOfBlocks: number) {}

  public generate(world: TreeWorldAccessor, random: JavaRandom, x: number, y: number, z: number): boolean {
    const at = world.getBlock(x, y, z);
    if (at !== BlockIds.Water && at !== BlockIds.WaterStill && at !== BlockIds.WaterFlowing) {
      return false;
    }

    const angle = random.nextFloat() * Math.PI;
    const x0 = x + 8 + (Math.sin(angle) * this.numberOfBlocks) / 8;
    const x1 = x + 8 - (Math.sin(angle) * this.numberOfBlocks) / 8;
    const z0 = z + 8 + (Math.cos(angle) * this.numberOfBlocks) / 8;
    const z1 = z + 8 - (Math.cos(angle) * this.numberOfBlocks) / 8;
    const y0 = y + random.nextInt(3) + 2;
    const y1 = y + random.nextInt(3) + 2;

    for (let i = 0; i <= this.numberOfBlocks; i++) {
      const cx = x0 + ((x1 - x0) * i) / this.numberOfBlocks;
      const cy = y0 + ((y1 - y0) * i) / this.numberOfBlocks;
      const cz = z0 + ((z1 - z0) * i) / this.numberOfBlocks;
      const size = (random.nextDouble() * this.numberOfBlocks) / 16;
      const rx =
        (Math.sin((i * Math.PI) / this.numberOfBlocks) + 1) * size + 1;
      const ry =
        (Math.sin((i * Math.PI) / this.numberOfBlocks) + 1) * size + 1;

      const minX = Math.floor(cx - rx / 2);
      const maxX = Math.floor(cx + rx / 2);
      const minY = Math.floor(cy - ry / 2);
      const maxY = Math.floor(cy + ry / 2);
      const minZ = Math.floor(cz - rx / 2);
      const maxZ = Math.floor(cz + rx / 2);

      for (let bx = minX; bx <= maxX; bx++) {
        for (let by = minY; by <= maxY; by++) {
          for (let bz = minZ; bz <= maxZ; bz++) {
            const dx = (bx + 0.5 - cx) / (rx / 2);
            const dy = (by + 0.5 - cy) / (ry / 2);
            const dz = (bz + 0.5 - cz) / (rx / 2);
            if (dx * dx + dy * dy + dz * dz >= 1) continue;
            if (world.getBlock(bx, by, bz) === BlockIds.Sand) {
              world.setBlock(bx, by, bz, this.clayBlockId);
            }
          }
        }
      }
    }
    return true;
  }
}
