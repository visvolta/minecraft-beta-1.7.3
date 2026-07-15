import type { TreeWorldAccessor } from '../trees/TreeWorldAccessor';
import type { JavaRandom } from '../random/JavaRandom';
import { BlockIds } from '../../../blocks/BlockId';

/**
 * Faithful port of Beta 1.7.3's WorldGenMinable.
 * Places ore veins (Coal, Iron, Gold, Redstone, Diamond, Lapis, Dirt, Gravel) inside Stone.
 */
export class WorldGenMinable {
  private readonly blockId: number;
  private readonly numberOfBlocks: number;

  public constructor(blockId: number, numberOfBlocks: number) {
    this.blockId = blockId;
    this.numberOfBlocks = numberOfBlocks;
  }

  public generate(world: TreeWorldAccessor, random: JavaRandom, x: number, y: number, z: number): boolean {
    const f = random.nextFloat() * Math.PI;
    const d1 = x + 8 + (Math.sin(f) * this.numberOfBlocks) / 8;
    const d2 = x + 8 - (Math.sin(f) * this.numberOfBlocks) / 8;
    const d3 = z + 8 + (Math.cos(f) * this.numberOfBlocks) / 8;
    const d4 = z + 8 - (Math.cos(f) * this.numberOfBlocks) / 8;
    const d5 = y + random.nextInt(3) - 2;
    const d6 = y + random.nextInt(3) - 2;

    for (let i = 0; i <= this.numberOfBlocks; i++) {
      const d7 = d1 + ((d2 - d1) * i) / this.numberOfBlocks;
      const d8 = d5 + ((d6 - d5) * i) / this.numberOfBlocks;
      const d9 = d3 + ((d4 - d3) * i) / this.numberOfBlocks;

      const d10 = (random.nextDouble() * this.numberOfBlocks) / 16;
      const d11 = (Math.sin((i * Math.PI) / this.numberOfBlocks) + 1) * d10 + 1;
      const d12 = (Math.sin((i * Math.PI) / this.numberOfBlocks) + 1) * d10 + 1;

      const minX = Math.floor(d7 - d11 / 2);
      const maxX = Math.floor(d7 + d11 / 2);
      const minY = Math.floor(d8 - d12 / 2);
      const maxY = Math.floor(d8 + d12 / 2);
      const minZ = Math.floor(d9 - d11 / 2);
      const maxZ = Math.floor(d9 + d11 / 2);

      for (let bx = minX; bx <= maxX; bx++) {
        const d13 = ((bx + 0.5 - d7) / (d11 / 2)) ** 2;
        if (d13 >= 1.0) continue;

        for (let by = minY; by <= maxY; by++) {
          const d14 = ((by + 0.5 - d8) / (d12 / 2)) ** 2;
          if (d13 + d14 >= 1.0) continue;

          for (let bz = minZ; bz <= maxZ; bz++) {
            const d15 = ((bz + 0.5 - d9) / (d11 / 2)) ** 2;
            if (d13 + d14 + d15 >= 1.0) continue;

            const existing = world.getBlock(bx, by, bz);
            // Ores only replace Stone (ID 1)
            if (existing === BlockIds.Stone) {
              world.setBlock(bx, by, bz, this.blockId);
            }
          }
        }
      }
    }

    return true;
  }
}
