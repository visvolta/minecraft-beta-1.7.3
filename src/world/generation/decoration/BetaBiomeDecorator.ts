import type { TreeWorldAccessor } from '../trees/TreeWorldAccessor';
import type { JavaRandom } from '../random/JavaRandom';
import type { BiomeId } from '../climate/biomes';
import { BlockIds } from '../../../blocks/BlockId';
import { WorldGenMinable } from './WorldGenMinable';
import { WorldGenClay } from './WorldGenClay';
import { WorldGenFlowers } from './WorldGenFlowers';
import { WorldGenTallGrass } from './WorldGenTallGrass';
import { WorldGenReed } from './WorldGenReed';
import { WorldGenCactus } from './WorldGenCactus';
import { WorldGenPumpkin } from './WorldGenPumpkin';

export class BetaBiomeDecorator {
  private readonly clayGen = new WorldGenClay(4);
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
  private readonly deadBushGen = new WorldGenFlowers(BlockIds.DeadBush);

  private readonly tallGrassGen = new WorldGenTallGrass(BlockIds.TallGrass);
  private readonly reedGen = new WorldGenReed(BlockIds.Reed);
  private readonly cactusGen = new WorldGenCactus(BlockIds.Cactus);
  private readonly pumpkinGen = new WorldGenPumpkin(BlockIds.Pumpkin);

  public decorate(world: TreeWorldAccessor, random: JavaRandom, biomeId: BiomeId, originX: number, originZ: number): void {
    // 1. Generate Ores & Underground Veins
    this.generateOres(world, random, originX, originZ);

    // 2. Generate Sand/Clay/Gravel Patches near sea level/water
    this.generatePatches(world, random, originX, originZ);

    // 3. Biome-specific vegetation counts
    let flowersCount = 2;
    let grassCount = 1;
    let deadBushesCount = 0;
    let cactiCount = 0;

    switch (biomeId) {
      case 'rainforest':
        flowersCount = 4;
        grassCount = 10;
        break;
      case 'forest':
        flowersCount = 4;
        grassCount = 2;
        break;
      case 'seasonalForest':
        flowersCount = 2;
        grassCount = 2;
        break;
      case 'swampland':
        flowersCount = 0;
        grassCount = 5;
        break;
      case 'savanna':
        flowersCount = 1;
        grassCount = 20;
        break;
      case 'shrubland':
        flowersCount = 1;
        grassCount = 2;
        break;
      case 'plains':
        flowersCount = 4;
        grassCount = 10;
        break;
      case 'desert':
        flowersCount = 0;
        grassCount = 0;
        deadBushesCount = 2;
        cactiCount = 10;
        break;
      case 'tundra':
        flowersCount = 0;
        grassCount = 0;
        break;
      case 'taiga':
        flowersCount = 1;
        grassCount = 1;
        break;
    }

    // Flowers
    for (let i = 0; i < flowersCount; ++i) {
      const rx = originX + random.nextInt(16) + 8;
      const rz = originZ + random.nextInt(16) + 8;
      const ry = random.nextInt(128);
      
      if (random.nextInt(3) === 0) {
        this.redFlowerGen.generate(world, random, rx, ry, rz);
      } else {
        this.yellowFlowerGen.generate(world, random, rx, ry, rz);
      }
    }

    // Tall Grass
    for (let i = 0; i < grassCount; ++i) {
      const rx = originX + random.nextInt(16) + 8;
      const rz = originZ + random.nextInt(16) + 8;
      const ry = random.nextInt(128);
      this.tallGrassGen.generate(world, random, rx, ry, rz);
    }

    // Dead Bushes
    for (let i = 0; i < deadBushesCount; ++i) {
      const rx = originX + random.nextInt(16) + 8;
      const rz = originZ + random.nextInt(16) + 8;
      const ry = random.nextInt(128);
      this.deadBushGen.generate(world, random, rx, ry, rz);
    }

    // Mushrooms (Brown / Red)
    // Brown has a 1-in-4 chance per chunk, Red has 1-in-8
    if (random.nextInt(4) === 0) {
      const rx = originX + random.nextInt(16) + 8;
      const rz = originZ + random.nextInt(16) + 8;
      const ry = random.nextInt(128);
      this.brownMushroomGen.generate(world, random, rx, ry, rz);
    }
    if (random.nextInt(8) === 0) {
      const rx = originX + random.nextInt(16) + 8;
      const rz = originZ + random.nextInt(16) + 8;
      const ry = random.nextInt(128);
      this.redMushroomGen.generate(world, random, rx, ry, rz);
    }

    // Sugar Cane (Reeds) - 1 attempt per chunk
    if (random.nextInt(5) === 0) {
      const rx = originX + random.nextInt(16) + 8;
      const rz = originZ + random.nextInt(16) + 8;
      const ry = random.nextInt(128);
      this.reedGen.generate(world, random, rx, ry, rz);
    }

    // Pumpkins - 1-in-32 chance per chunk
    if (random.nextInt(32) === 0) {
      const rx = originX + random.nextInt(16) + 8;
      const rz = originZ + random.nextInt(16) + 8;
      const ry = random.nextInt(128);
      this.pumpkinGen.generate(world, random, rx, ry, rz);
    }

    // Cacti
    for (let i = 0; i < cactiCount; ++i) {
      const rx = originX + random.nextInt(16) + 8;
      const rz = originZ + random.nextInt(16) + 8;
      const ry = random.nextInt(128);
      this.cactusGen.generate(world, random, rx, ry, rz);
    }
  }

  private generateOres(world: TreeWorldAccessor, random: JavaRandom, originX: number, originZ: number): void {
    // Dirt veins (20x size 32, Y: 0-128)
    this.genStandardOre(world, random, 20, this.dirtGen, 0, 128, originX, originZ);

    // Gravel veins (10x size 32, Y: 0-128)
    this.genStandardOre(world, random, 10, this.gravelGen, 0, 128, originX, originZ);

    // Coal (20x size 16, Y: 0-128)
    this.genStandardOre(world, random, 20, this.coalGen, 0, 128, originX, originZ);

    // Iron (20x size 8, Y: 0-64)
    this.genStandardOre(world, random, 20, this.ironGen, 0, 64, originX, originZ);

    // Gold (2x size 8, Y: 0-32)
    this.genStandardOre(world, random, 2, this.goldGen, 0, 32, originX, originZ);

    // Redstone (8x size 7, Y: 0-16)
    this.genStandardOre(world, random, 8, this.redstoneGen, 0, 16, originX, originZ);

    // Diamond (1x size 7, Y: 0-16)
    this.genStandardOre(world, random, 1, this.diamondGen, 0, 16, originX, originZ);

    // Lapis Lazuli (1x size 6, Y: center at 16, triangle spread)
    for (let i = 0; i < 1; ++i) {
      const rx = originX + random.nextInt(16) + 8;
      const ry = random.nextInt(16) + random.nextInt(16);
      const rz = originZ + random.nextInt(16) + 8;
      this.lapisGen.generate(world, random, rx, ry, rz);
    }
  }

  private generatePatches(world: TreeWorldAccessor, random: JavaRandom, originX: number, originZ: number): void {
    // Clay patches underwater (1x per chunk)
    const rx = originX + random.nextInt(16) + 8;
    const rz = originZ + random.nextInt(16) + 8;
    const ry = 64; // near sea level
    this.clayGen.generate(world, random, rx, ry, rz);
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
    for (let i = 0; i < veinsCount; ++i) {
      const rx = originX + random.nextInt(16) + 8;
      const ry = random.nextInt(maxY - minY) + minY;
      const rz = originZ + random.nextInt(16) + 8;
      generator.generate(world, random, rx, ry, rz);
    }
  }
}
