import type { TreeWorldAccessor } from '../trees/TreeWorldAccessor';
import type { JavaRandom } from '../random/JavaRandom';
import { BlockIds } from '../../../blocks/BlockId';

/**
 * Faithful port of Beta 1.7.3's WorldGenLakes.
 * Places water or still lava lakes inside caves or at the surface.
 */
export class WorldGenLakes {
  private readonly blockId: number;

  public constructor(blockId: number) {
    this.blockId = blockId;
  }

  public generate(world: TreeWorldAccessor, random: JavaRandom, x: number, y: number, z: number): boolean {
    let startX = x - 8;
    let startZ = z - 8;
    let startY = y;

    // Scan down to find the solid floor
    while (startY > 0 && world.getBlock(startX, startY, startZ) === 0) {
      startY--;
    }
    startY -= 4;
    if (startY < 0) {
      return false;
    }

    const arrayOfBoolean = new Uint8Array(2048); // 16 * 16 * 8

    const i = random.nextInt(4) + 4;
    for (let j = 0; j < i; j++) {
      const d1 = random.nextDouble() * 6.0 + 3.0;
      const d2 = random.nextDouble() * 4.0 + 2.0;
      const d3 = random.nextDouble() * 6.0 + 3.0;

      const d4 = random.nextDouble() * (16.0 - d1 - 2.0) + 1.0 + d1 / 2.0;
      const d5 = random.nextDouble() * (8.0 - d2 - 4.0) + 2.0 + d2 / 2.0;
      const d6 = random.nextDouble() * (16.0 - d3 - 2.0) + 1.0 + d3 / 2.0;

      for (let k = 1; k < 15; k++) {
        for (let m = 1; m < 15; m++) {
          for (let n = 1; n < 7; n++) {
            const d7 = (k - d4) / (d1 / 2.0);
            const d8 = (n - d5) / (d2 / 2.0);
            const d9 = (m - d6) / (d3 / 2.0);
            const d10 = d7 * d7 + d8 * d8 + d9 * d9;
            if (d10 < 1.0) {
              arrayOfBoolean[(k * 16 + m) * 8 + n] = 1;
            }
          }
        }
      }
    }

    // Verify space is valid (no liquid spilling into the sky)
    for (let j = 0; j < 16; j++) {
      for (let i1 = 0; i1 < 16; i1++) {
        for (let i2 = 0; i2 < 8; i2++) {
          const isLakeBlock = arrayOfBoolean[(j * 16 + i1) * 8 + i2] !== 0;
          if (isLakeBlock) {
            continue;
          }

          const blockY = startY + i2;
          const adjToLake =
            (j < 15 && arrayOfBoolean[((j + 1) * 16 + i1) * 8 + i2] !== 0) ||
            (j > 0 && arrayOfBoolean[((j - 1) * 16 + i1) * 8 + i2] !== 0) ||
            (i1 < 15 && arrayOfBoolean[(j * 16 + (i1 + 1)) * 8 + i2] !== 0) ||
            (i1 > 0 && arrayOfBoolean[(j * 16 + (i1 - 1)) * 8 + i2] !== 0) ||
            (i2 < 7 && arrayOfBoolean[(j * 16 + i1) * 8 + (i2 + 1)] !== 0) ||
            (i2 > 0 && arrayOfBoolean[(j * 16 + i1) * 8 + (i2 - 1)] !== 0);

          if (adjToLake && i2 < 4) {
            const currentBlockId = world.getBlock(startX + j, blockY, startZ + i1);
            // If the block adjacent to the water in the lower half is Air, don't generate to avoid spills
            if (currentBlockId === 0) {
              return false;
            }
          }
        }
      }
    }

    // Place the lake blocks (fluid in the lower half, air in the upper half)
    for (let j = 0; j < 16; j++) {
      for (let i1 = 0; i1 < 16; i1++) {
        for (let i2 = 0; i2 < 8; i2++) {
          const isLakeBlock = arrayOfBoolean[(j * 16 + i1) * 8 + i2] !== 0;
          if (isLakeBlock) {
            const blockToPlace = i2 < 4 ? this.blockId : 0;
            world.setBlock(startX + j, startY + i2, startZ + i1, blockToPlace);
          }
        }
      }
    }

    // Place stone surrounding the lake where appropriate
    for (let j = 0; j < 16; j++) {
      for (let i1 = 0; i1 < 16; i1++) {
        for (let i2 = 0; i2 < 8; i2++) {
          const isLakeBlock = arrayOfBoolean[(j * 16 + i1) * 8 + i2] !== 0;
          if (isLakeBlock) {
            continue;
          }

          const isAdjacent =
            (j < 15 && arrayOfBoolean[((j + 1) * 16 + i1) * 8 + i2] !== 0) ||
            (j > 0 && arrayOfBoolean[((j - 1) * 16 + i1) * 8 + i2] !== 0) ||
            (i1 < 15 && arrayOfBoolean[(j * 16 + (i1 + 1)) * 8 + i2] !== 0) ||
            (i1 > 0 && arrayOfBoolean[(j * 16 + (i1 - 1)) * 8 + i2] !== 0) ||
            (i2 < 7 && arrayOfBoolean[(j * 16 + i1) * 8 + (i2 + 1)] !== 0) ||
            (i2 > 0 && arrayOfBoolean[(j * 16 + i1) * 8 + (i2 - 1)] !== 0);

          if (isAdjacent) {
            const blockY = startY + i2;
            const currentBlockId = world.getBlock(startX + j, blockY, startZ + i1);
            if (i2 < 4 && currentBlockId === 0) {
              // Seal any air gap below fluid level with Stone (for Lava) or Dirt (for Water)
              const sealBlock = (this.blockId === BlockIds.Lava || this.blockId === BlockIds.LavaStill)
                ? BlockIds.Stone
                : BlockIds.Dirt;
              world.setBlock(startX + j, blockY, startZ + i1, sealBlock);
            }
          }
        }
      }
    }

    return true;
  }
}
