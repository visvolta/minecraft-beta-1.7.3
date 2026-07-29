import type { TreeWorldAccessor } from '../trees/TreeWorldAccessor';
import type { JavaRandom } from '../random/JavaRandom';
import { BlockIds } from '../../../blocks/BlockId';

/** Faithful port of Beta 1.7.3 WorldGenFlowers (also used for mushrooms). */
export class WorldGenFlowers {
  public constructor(private readonly blockId: number) {}

  public generate(world: TreeWorldAccessor, random: JavaRandom, x: number, y: number, z: number): boolean {
    for (let i = 0; i < 64; i++) {
      const bx = x + random.nextInt(8) - random.nextInt(8);
      const by = y + random.nextInt(4) - random.nextInt(4);
      const bz = z + random.nextInt(8) - random.nextInt(8);
      if (by < 0 || by >= 128) continue;
      if (world.getBlock(bx, by, bz) !== 0) continue;

      const below = world.getBlock(bx, by - 1, bz);
      let canPlace = false;

      if (this.blockId === BlockIds.Dandelion || this.blockId === BlockIds.Rose) {
        canPlace = below === BlockIds.Grass || below === BlockIds.Dirt || below === BlockIds.Podzol;
      } else if (this.blockId === BlockIds.BrownMushroom || this.blockId === BlockIds.RedMushroom) {
        // Beta BlockMushroom.canThisPlantGrowOnThisBlockID = opaqueCubeLookup.
        // Exclude non-opaque solids that should not support mushrooms (ice,
        // glass, leaves, snow). Netherrack, stone, dirt, cobblestone etc. are
        // valid because they are opaque cubes. The light < 13 requirement is
        // enforced at runtime by MushroomBehaviour.canSurvive.
        canPlace =
          below !== 0 &&
          below !== BlockIds.Water &&
          below !== BlockIds.WaterStill &&
          below !== BlockIds.WaterFlowing &&
          below !== BlockIds.Lava &&
          below !== BlockIds.LavaStill &&
          below !== BlockIds.LavaFlowing &&
          below !== BlockIds.Ice &&
          below !== 20 && // Glass
          below !== BlockIds.Leaves &&
          below !== BlockIds.BirchLeaves &&
          below !== BlockIds.SpruceLeaves &&
          below !== BlockIds.Snow;
      }

      if (canPlace) {
        world.setBlock(bx, by, bz, this.blockId);
      }
    }
    return true;
  }
}
