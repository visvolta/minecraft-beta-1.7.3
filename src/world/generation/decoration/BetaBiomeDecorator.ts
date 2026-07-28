import type { TreeWorldAccessor } from '../trees/TreeWorldAccessor';
import type { JavaRandom } from '../random/JavaRandom';
import type { BiomeId } from '../climate/biomes';
import { BlockIds } from '../../../blocks/BlockId';
import { TALL_GRASS_META_FERN, TALL_GRASS_META_GRASS } from '../../../blocks/TallGrassMeta';
import { WorldGenMinable } from './WorldGenMinable';
import { WorldGenClay } from './WorldGenClay';
import { WorldGenFlowers } from './WorldGenFlowers';
import { WorldGenTallGrass } from './WorldGenTallGrass';
import { WorldGenDeadBush } from './WorldGenDeadBush';
import { WorldGenReed } from './WorldGenReed';
import { WorldGenCactus } from './WorldGenCactus';
import { WorldGenPumpkin } from './WorldGenPumpkin';
import { WorldGenLiquids } from './WorldGenLiquids';

/**
 * Beta 1.7.3 population features that run after lakes/dungeons and before/with
 * trees — clay, ores, flowers, grass, dead bush, mushrooms, reeds, pumpkin,
 * cactus, springs. Tree placement stays in BetaTreeDecorator so the RNG stream
 * matches ChunkProviderGenerate.populate exactly.
 *
 * Coordinate rule (Beta):
 * - clay + ores: origin + nextInt(16)   (NO +8)
 * - plants/springs: origin + nextInt(16) + 8
 */
export class BetaBiomeDecorator {
  private readonly clayGen = new WorldGenClay(32);
  private readonly dirtGen = new WorldGenMinable(BlockIds.Dirt, 32);
  private readonly gravelGen = new WorldGenMinable(BlockIds.Gravel, 32);
  private readonly coalGen = new WorldGenMinable(BlockIds.CoalOre, 16);
  private readonly ironGen = new WorldGenMinable(BlockIds.IronOre, 8);
  private readonly goldGen = new WorldGenMinable(BlockIds.GoldOre, 8);
  private readonly redstoneGen = new WorldGenMinable(BlockIds.RedstoneOre, 7);
  private readonly diamondGen = new WorldGenMinable(BlockIds.DiamondOre, 7);
  private readonly lapisGen = new WorldGenMinable(BlockIds.LapisOre, 6);

  private readonly yellowFlowerGen = new WorldGenFlowers(BlockIds.Dandelion);
  private readonly redFlowerGen = new WorldGenFlowers(BlockIds.Rose);
  private readonly brownMushroomGen = new WorldGenFlowers(BlockIds.BrownMushroom);
  private readonly redMushroomGen = new WorldGenFlowers(BlockIds.RedMushroom);
  private readonly deadBushGen = new WorldGenDeadBush(BlockIds.DeadBush);
  private readonly reedGen = new WorldGenReed();
  private readonly cactusGen = new WorldGenCactus();
  private readonly pumpkinGen = new WorldGenPumpkin();
  private readonly waterSpringGen = new WorldGenLiquids(BlockIds.WaterFlowing);
  private readonly lavaSpringGen = new WorldGenLiquids(BlockIds.LavaFlowing);

  /**
   * Clay + underground ores only — called before trees in the Beta stream.
   */
  public generateUnderground(world: TreeWorldAccessor, random: JavaRandom, originX: number, originZ: number): void {
    for (let i = 0; i < 10; i++) {
      const rx = originX + random.nextInt(16);
      const ry = random.nextInt(128);
      const rz = originZ + random.nextInt(16);
      this.clayGen.generate(world, random, rx, ry, rz);
    }

    this.genStandardOre(world, random, 20, this.dirtGen, 0, 128, originX, originZ);
    this.genStandardOre(world, random, 10, this.gravelGen, 0, 128, originX, originZ);
    this.genStandardOre(world, random, 20, this.coalGen, 0, 128, originX, originZ);
    this.genStandardOre(world, random, 20, this.ironGen, 0, 64, originX, originZ);
    this.genStandardOre(world, random, 2, this.goldGen, 0, 32, originX, originZ);
    this.genStandardOre(world, random, 8, this.redstoneGen, 0, 16, originX, originZ);
    this.genStandardOre(world, random, 1, this.diamondGen, 0, 16, originX, originZ);

    // Lapis: nextInt(16) + nextInt(16) for Y (triangle around 16).
    for (let i = 0; i < 1; i++) {
      const rx = originX + random.nextInt(16);
      const ry = random.nextInt(16) + random.nextInt(16);
      const rz = originZ + random.nextInt(16);
      this.lapisGen.generate(world, random, rx, ry, rz);
    }
  }

  /**
   * Surface vegetation + springs — called after trees in the Beta stream.
   */
  public generateSurface(
    world: TreeWorldAccessor,
    random: JavaRandom,
    biomeId: BiomeId,
    originX: number,
    originZ: number,
  ): void {
    // Yellow flowers
    let yellowCount = 0;
    if (biomeId === 'forest') yellowCount = 2;
    if (biomeId === 'seasonalForest') yellowCount = 4;
    if (biomeId === 'taiga') yellowCount = 2;
    if (biomeId === 'plains') yellowCount = 3;
    for (let i = 0; i < yellowCount; i++) {
      const rx = originX + random.nextInt(16) + 8;
      const ry = random.nextInt(128);
      const rz = originZ + random.nextInt(16) + 8;
      this.yellowFlowerGen.generate(world, random, rx, ry, rz);
    }

    // Tall grass / fern
    let grassCount = 0;
    if (biomeId === 'forest') grassCount = 2;
    if (biomeId === 'rainforest') grassCount = 10;
    if (biomeId === 'seasonalForest') grassCount = 2;
    if (biomeId === 'taiga') grassCount = 1;
    if (biomeId === 'plains') grassCount = 10;
    for (let i = 0; i < grassCount; i++) {
      let meta = TALL_GRASS_META_GRASS;
      if (biomeId === 'rainforest' && random.nextInt(3) !== 0) {
        meta = TALL_GRASS_META_FERN;
      }
      const rx = originX + random.nextInt(16) + 8;
      const ry = random.nextInt(128);
      const rz = originZ + random.nextInt(16) + 8;
      new WorldGenTallGrass(BlockIds.TallGrass, meta).generate(world, random, rx, ry, rz);
    }

    // Dead bush (desert)
    let deadBushCount = 0;
    if (biomeId === 'desert') deadBushCount = 2;
    for (let i = 0; i < deadBushCount; i++) {
      const rx = originX + random.nextInt(16) + 8;
      const ry = random.nextInt(128);
      const rz = originZ + random.nextInt(16) + 8;
      this.deadBushGen.generate(world, random, rx, ry, rz);
    }

    // Red flower 1/2
    if (random.nextInt(2) === 0) {
      const rx = originX + random.nextInt(16) + 8;
      const ry = random.nextInt(128);
      const rz = originZ + random.nextInt(16) + 8;
      this.redFlowerGen.generate(world, random, rx, ry, rz);
    }

    // Brown mushroom 1/4
    if (random.nextInt(4) === 0) {
      const rx = originX + random.nextInt(16) + 8;
      const ry = random.nextInt(128);
      const rz = originZ + random.nextInt(16) + 8;
      this.brownMushroomGen.generate(world, random, rx, ry, rz);
    }

    // Red mushroom 1/8
    if (random.nextInt(8) === 0) {
      const rx = originX + random.nextInt(16) + 8;
      const ry = random.nextInt(128);
      const rz = originZ + random.nextInt(16) + 8;
      this.redMushroomGen.generate(world, random, rx, ry, rz);
    }

    // Reeds ×10
    for (let i = 0; i < 10; i++) {
      const rx = originX + random.nextInt(16) + 8;
      const ry = random.nextInt(128);
      const rz = originZ + random.nextInt(16) + 8;
      this.reedGen.generate(world, random, rx, ry, rz);
    }

    // Pumpkin 1/32
    if (random.nextInt(32) === 0) {
      const rx = originX + random.nextInt(16) + 8;
      const ry = random.nextInt(128);
      const rz = originZ + random.nextInt(16) + 8;
      this.pumpkinGen.generate(world, random, rx, ry, rz);
    }

    // Cactus (desert +10)
    let cactusCount = 0;
    if (biomeId === 'desert') cactusCount = 10;
    for (let i = 0; i < cactusCount; i++) {
      const rx = originX + random.nextInt(16) + 8;
      const ry = random.nextInt(128);
      const rz = originZ + random.nextInt(16) + 8;
      this.cactusGen.generate(world, random, rx, ry, rz);
    }

    // Water springs ×50
    for (let i = 0; i < 50; i++) {
      const rx = originX + random.nextInt(16) + 8;
      const ry = random.nextInt(random.nextInt(120) + 8);
      const rz = originZ + random.nextInt(16) + 8;
      this.waterSpringGen.generate(world, random, rx, ry, rz);
    }

    // Lava springs ×20
    for (let i = 0; i < 20; i++) {
      const rx = originX + random.nextInt(16) + 8;
      const ry = random.nextInt(random.nextInt(random.nextInt(112) + 8) + 8);
      const rz = originZ + random.nextInt(16) + 8;
      this.lavaSpringGen.generate(world, random, rx, ry, rz);
    }
  }

  private genStandardOre(
    world: TreeWorldAccessor,
    random: JavaRandom,
    veinsCount: number,
    generator: WorldGenMinable,
    minY: number,
    maxY: number,
    originX: number,
    originZ: number,
  ): void {
    for (let i = 0; i < veinsCount; i++) {
      const rx = originX + random.nextInt(16);
      const ry = random.nextInt(maxY - minY) + minY;
      const rz = originZ + random.nextInt(16);
      generator.generate(world, random, rx, ry, rz);
    }
  }
}
