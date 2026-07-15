import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../../chunkConstants';
import { JavaRandom } from '../random/JavaRandom';
import { BetaTerrainGenerator } from '../BetaTerrainGenerator';
import { ClimateSampler } from '../climate/ClimateSampler';
import { selectBiome } from '../climate/BiomeSelector';
import type { BiomeId } from '../climate/biomes';
import { TreeGenerator } from './TreeGenerator';
import { BigTreeGenerator } from './BigTreeGenerator';
import { TaigaTree1Generator } from './TaigaTree1Generator';
import { TaigaTree2Generator } from './TaigaTree2Generator';
import { ScratchTreeWorld } from './TreeWorldAccessor';
import { BlockIds } from '../../../blocks/BlockId';
import { WorldGenLakes } from '../decoration/WorldGenLakes';
import { WorldGenDungeons } from '../decoration/WorldGenDungeons';
import { BetaBiomeDecorator } from '../decoration/BetaBiomeDecorator';

/** Matches Beta's `IChunkProvider.a`'s neighbour-reach radius assumption. */
const NEIGHBOUR_RADIUS = 1;

export class BetaTreeDecorator {
  private readonly worldSeed: bigint;
  private readonly terrainGenerator: BetaTerrainGenerator;
  private readonly climateSampler: ClimateSampler;
  private readonly enableCaves: boolean;
  private readonly random = new JavaRandom(0);

  // Instantiated feature generators
  private readonly waterLakeGen = new WorldGenLakes(BlockIds.Water);
  private readonly lavaLakeGen = new WorldGenLakes(BlockIds.LavaStill);
  private readonly dungeonGen = new WorldGenDungeons();
  private readonly biomeDecorator = new BetaBiomeDecorator();

  private readonly treeGenerator = new TreeGenerator();
  private readonly taigaTree1 = new TaigaTree1Generator();
  private readonly taigaTree2 = new TaigaTree2Generator();

  public constructor(worldSeed: bigint, terrainGenerator: BetaTerrainGenerator, enableCaves: boolean) {
    this.worldSeed = worldSeed;
    this.terrainGenerator = terrainGenerator;
    this.climateSampler = new ClimateSampler(worldSeed);
    this.enableCaves = enableCaves;
  }

  /**
   * Decorates `targetBlocks` (the target chunk's own already-generated,
   * already-cave-carved block array — mutated in place) with the complete
   * decoration sequence, replaying placement from the target chunk and
   * its immediate neighbours to prevent boundary artifacts.
   */
  public decorate(targetChunkX: number, targetChunkZ: number, targetBlocks: Uint8Array): void {
    const scratch = new ScratchTreeWorld(this.worldSeed, this.terrainGenerator, this.enableCaves);
    scratch.seedTargetChunk(targetChunkX, targetChunkZ, targetBlocks);

    // Decorate the source chunk and its immediate neighbors (radius 1)
    for (let sourceX = targetChunkX - NEIGHBOUR_RADIUS; sourceX <= targetChunkX + NEIGHBOUR_RADIUS; sourceX++) {
      for (let sourceZ = targetChunkZ - NEIGHBOUR_RADIUS; sourceZ <= targetChunkZ + NEIGHBOUR_RADIUS; sourceZ++) {
        this.decorateSourceChunk(sourceX, sourceZ, scratch);
      }
    }

    // Copy back only the target chunk's own cells (writes to any other
    // scratch chunk are discarded — each of those neighbours will
    // independently recompute and keep its own portion when IT is the
    // target of a future decorate() call).
    const finalTargetBlocks = scratch.getScratchBlocks(targetChunkX, targetChunkZ)!;
    targetBlocks.set(finalTargetBlocks);
  }

  /**
   * Replays the complete decoration sequence for one source chunk,
   * drawing sequentially from the same per-chunk RNG stream.
   */
  private decorateSourceChunk(chunkX: number, chunkZ: number, scratch: ScratchTreeWorld): void {
    const originX = chunkX * CHUNK_SIZE_X;
    const originZ = chunkZ * CHUNK_SIZE_Z;

    // 1. Seed chunk random using coordinate multipliers (authentic Beta seeding)
    this.random.setSeed(this.worldSeed);
    const i1 = this.random.nextLong() / 2n * 2n + 1n;
    const j1 = this.random.nextLong() / 2n * 2n + 1n;
    this.random.setSeed(BigInt(chunkX) * i1 + BigInt(chunkZ) * j1 ^ this.worldSeed);

    const biomeId = this.sampleChunkBiome(chunkX, chunkZ);

    // 2. Water Lakes (1-in-4, skipped in deserts)
    if (biomeId !== 'desert' && this.random.nextInt(4) === 0) {
      const rx = originX + this.random.nextInt(16) + 8;
      const ry = this.random.nextInt(128);
      const rz = originZ + this.random.nextInt(16) + 8;
      this.waterLakeGen.generate(scratch, this.random, rx, ry, rz);
    }

    // 3. Lava Lakes (1-in-8, height 0-128, extra check if above sea level)
    if (this.random.nextInt(8) === 0) {
      const rx = originX + this.random.nextInt(16) + 8;
      const ry = this.random.nextInt(this.random.nextInt(120) + 8);
      const rz = originZ + this.random.nextInt(16) + 8;
      if (ry < 64 || this.random.nextInt(10) === 0) {
        this.lavaLakeGen.generate(scratch, this.random, rx, ry, rz);
      }
    }

    // 4. Dungeons (8 attempts)
    for (let d = 0; d < 8; d++) {
      const rx = originX + this.random.nextInt(16) + 8;
      const ry = this.random.nextInt(128);
      const rz = originZ + this.random.nextInt(16) + 8;
      this.dungeonGen.generate(scratch, this.random, rx, ry, rz);
    }

    // 5. Biome Decorator (Sand/Clay/Gravel Patches + Ores + Vegetation except Trees)
    this.biomeDecorator.decorate(scratch, this.random, biomeId, originX, originZ);

    // 6. Tree Placement (Runs sequentially after ores, drawing from the same continuous random stream)
    this.placeBiomeTrees(scratch, biomeId, originX, originZ);
  }

  private placeBiomeTrees(scratch: ScratchTreeWorld, biomeId: BiomeId, originX: number, originZ: number): void {
    const treeNoiseSample = this.terrainGenerator.treeCountNoise.sample2D(
      originX * 0.5,
      originZ * 0.5,
    );
    const baseTreeFactor = Math.trunc(
      (treeNoiseSample / 8 + this.random.nextDouble() * 4 + 4) / 3,
    );

    let treeCount = 0;
    if (this.random.nextInt(10) === 0) {
      treeCount++;
    }
    treeCount += this.biomeTreeCountBonus(biomeId, baseTreeFactor);

    if (treeCount <= 0) {
      return;
    }

    const { generator, isTaiga } = this.selectTreeType(biomeId);

    const bigTreeGenerator = new BigTreeGenerator();
    bigTreeGenerator.configure(1.0, 1.0, 1.0);

    for (let i = 0; i < treeCount; i++) {
      const x = originX + this.random.nextInt(CHUNK_SIZE_X) + 8;
      const z = originZ + this.random.nextInt(CHUNK_SIZE_Z) + 8;
      const y = scratch.getHeight(x, z);

      if (isTaiga) {
        const taigaGenerator = this.random.nextInt(3) === 0 ? this.taigaTree1 : this.taigaTree2;
        taigaGenerator.generate(scratch, this.random, x, y, z);
        continue;
      }

      if (generator === 'big') {
        bigTreeGenerator.generate(scratch, this.random, x, y, z);
      } else {
        this.treeGenerator.generate(scratch, this.random, x, y, z);
      }
    }
  }

  /** Matches WorldChunkManager.a(k1+16, l1+16): one biome sample at the chunk's far corner. */
  private sampleChunkBiome(chunkX: number, chunkZ: number): BiomeId {
    const sampleX = chunkX * CHUNK_SIZE_X + 16;
    const sampleZ = chunkZ * CHUNK_SIZE_Z + 16;
    const [climate] = this.climateSampler.sampleRegion(sampleX, sampleZ, 1, 1);
    return selectBiome(climate!).id;
  }

  private biomeTreeCountBonus(biomeId: BiomeId, baseFactor: number): number {
    switch (biomeId) {
      case 'forest':
        return baseFactor + 5;
      case 'rainforest':
        return baseFactor + 5;
      case 'seasonalForest':
        return baseFactor + 2;
      case 'taiga':
        return baseFactor + 5;
      case 'desert':
      case 'tundra':
      case 'plains':
        return -20;
      default:
        return 0;
    }
  }

  private selectTreeType(biomeId: BiomeId): { generator: 'oak' | 'big'; isTaiga: boolean } {
    if (biomeId === 'taiga') {
      return { generator: 'oak', isTaiga: true };
    }

    let generator: 'oak' | 'big' = 'oak';

    if (this.random.nextInt(10) === 0) {
      generator = 'big';
    }

    if (biomeId === 'rainforest' && this.random.nextInt(3) === 0) {
      generator = 'big';
    }

    return { generator, isTaiga: false };
  }
}
