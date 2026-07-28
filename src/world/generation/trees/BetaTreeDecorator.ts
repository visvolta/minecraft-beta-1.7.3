import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../../chunkConstants';
import { JavaRandom } from '../random/JavaRandom';
import { BetaTerrainGenerator } from '../BetaTerrainGenerator';
import { ClimateSampler } from '../climate/ClimateSampler';
import { selectBiome } from '../climate/BiomeSelector';
import type { BiomeId } from '../climate/biomes';
import { BirchTreeGenerator } from './BirchTreeGenerator';
import { TreeGenerator } from './TreeGenerator';
import { BigTreeGenerator } from './BigTreeGenerator';
import { TaigaTree1Generator } from './TaigaTree1Generator';
import { TaigaTree2Generator } from './TaigaTree2Generator';
import { ScratchTreeWorld } from './TreeWorldAccessor';
import { BlockIds } from '../../../blocks/BlockId';
import { WorldGenLakes } from '../decoration/WorldGenLakes';
import { WorldGenDungeons } from '../decoration/WorldGenDungeons';
import { BetaBiomeDecorator } from '../decoration/BetaBiomeDecorator';
import { IntentionalTerrainExtras } from '../decoration/IntentionalTerrainExtras';
import { DungeonFeatureCollector } from '../decoration/DungeonFeatureCollector';
import type { GeneratedDungeonFeature } from '../decoration/GeneratedChunkFeatures';

/**
 * Neighbour radius derived from feature reach:
 * lakes extend ~8 past chunk edge; big oak / mega spruce canopy ≤ ~7.
 * ceil(8/16)=1 is not enough for diagonal lake corners from adjacent sources;
 * radius 2 (32 blocks) is the measured minimum safe value.
 */
const NEIGHBOUR_RADIUS = 2;

export interface BetaTreeDecoratorOptions {
  readonly enableIntentionalExtras?: boolean;
}

export class BetaTreeDecorator {
  private readonly worldSeed: bigint;
  private readonly terrainGenerator: BetaTerrainGenerator;
  private readonly climateSampler: ClimateSampler;
  private readonly enableCaves: boolean;
  private readonly enableIntentionalExtras: boolean;
  private readonly random = new JavaRandom(0);
  private readonly waterLakeGen = new WorldGenLakes(BlockIds.WaterStill);
  private readonly lavaLakeGen = new WorldGenLakes(BlockIds.LavaStill);
  private readonly dungeonCollector = new DungeonFeatureCollector();
  private readonly dungeonGen = new WorldGenDungeons(this.dungeonCollector);
  private readonly biomeDecorator = new BetaBiomeDecorator();
  private readonly intentionalExtras: IntentionalTerrainExtras;
  private readonly treeGenerator = new TreeGenerator();
  private readonly taigaTree1 = new TaigaTree1Generator();
  private readonly taigaTree2 = new TaigaTree2Generator();
  private readonly birchTree = new BirchTreeGenerator();
  private collectedDungeons: GeneratedDungeonFeature[] = [];

  public constructor(
    worldSeed: bigint,
    terrainGenerator: BetaTerrainGenerator,
    enableCaves: boolean,
    options: BetaTreeDecoratorOptions = {},
  ) {
    this.worldSeed = worldSeed;
    this.terrainGenerator = terrainGenerator;
    this.climateSampler = new ClimateSampler(worldSeed);
    this.enableCaves = enableCaves;
    this.enableIntentionalExtras = options.enableIntentionalExtras ?? true;
    this.intentionalExtras = new IntentionalTerrainExtras(worldSeed);
  }

  public takePendingDungeons(): GeneratedDungeonFeature[] {
    const out = this.collectedDungeons;
    this.collectedDungeons = [];
    return out;
  }

  public decorate(
    targetChunkX: number,
    targetChunkZ: number,
    targetBlocks: Uint8Array,
    targetMetadata?: Uint8Array,
  ): Uint8Array {
    const metadata = targetMetadata ?? new Uint8Array(targetBlocks.length);
    const scratch = new ScratchTreeWorld(this.worldSeed, this.terrainGenerator, this.enableCaves);
    scratch.seedTargetChunk(targetChunkX, targetChunkZ, targetBlocks, metadata);

    // Only record dungeons whose spawner/chests fall inside the target chunk.
    this.dungeonCollector.takeFeatures();

    for (let sourceX = targetChunkX - NEIGHBOUR_RADIUS; sourceX <= targetChunkX + NEIGHBOUR_RADIUS; sourceX++) {
      for (let sourceZ = targetChunkZ - NEIGHBOUR_RADIUS; sourceZ <= targetChunkZ + NEIGHBOUR_RADIUS; sourceZ++) {
        this.decorateSourceChunk(sourceX, sourceZ, scratch);
      }
    }

    const features = this.dungeonCollector.takeFeatures();
    const minX = targetChunkX * CHUNK_SIZE_X;
    const minZ = targetChunkZ * CHUNK_SIZE_Z;
    const maxX = minX + CHUNK_SIZE_X;
    const maxZ = minZ + CHUNK_SIZE_Z;
    for (const f of features) {
      const inTarget =
        (f.spawnerX >= minX && f.spawnerX < maxX && f.spawnerZ >= minZ && f.spawnerZ < maxZ) ||
        f.chests.some((c) => c.x >= minX && c.x < maxX && c.z >= minZ && c.z < maxZ);
      if (inTarget) {
        this.collectedDungeons.push(f);
      }
    }

    const finalBlocks = scratch.getScratchBlocks(targetChunkX, targetChunkZ)!;
    targetBlocks.set(finalBlocks);
    const finalMeta = scratch.getScratchMetadata(targetChunkX, targetChunkZ)!;
    metadata.set(finalMeta);
    return metadata;
  }

  private decorateSourceChunk(chunkX: number, chunkZ: number, scratch: ScratchTreeWorld): void {
    const originX = chunkX * CHUNK_SIZE_X;
    const originZ = chunkZ * CHUNK_SIZE_Z;

    this.random.setSeed(this.worldSeed);
    const i1 = (this.random.nextLong() / 2n) * 2n + 1n;
    const j1 = (this.random.nextLong() / 2n) * 2n + 1n;
    this.random.setSeed(BigInt(chunkX) * i1 + BigInt(chunkZ) * j1 ^ this.worldSeed);

    const biomeId = this.sampleChunkBiome(chunkX, chunkZ);

    if (this.random.nextInt(4) === 0) {
      const rx = originX + this.random.nextInt(16) + 8;
      const ry = this.random.nextInt(128);
      const rz = originZ + this.random.nextInt(16) + 8;
      this.waterLakeGen.generate(scratch, this.random, rx, ry, rz);
    }

    if (this.random.nextInt(8) === 0) {
      const rx = originX + this.random.nextInt(16) + 8;
      const ry = this.random.nextInt(this.random.nextInt(120) + 8);
      const rz = originZ + this.random.nextInt(16) + 8;
      if (ry < 64 || this.random.nextInt(10) === 0) {
        this.lavaLakeGen.generate(scratch, this.random, rx, ry, rz);
      }
    }

    for (let d = 0; d < 8; d++) {
      const rx = originX + this.random.nextInt(16) + 8;
      const ry = this.random.nextInt(128);
      const rz = originZ + this.random.nextInt(16) + 8;
      this.dungeonGen.generate(scratch, this.random, rx, ry, rz);
    }

    this.biomeDecorator.generateUnderground(scratch, this.random, originX, originZ);
    this.placeBiomeTrees(scratch, biomeId, originX, originZ);
    this.biomeDecorator.generateSurface(scratch, this.random, biomeId, originX, originZ);

    if (this.enableIntentionalExtras) {
      this.intentionalExtras.apply(scratch, chunkX, chunkZ, biomeId);
    }
  }

  private placeBiomeTrees(
    scratch: ScratchTreeWorld,
    biomeId: BiomeId,
    originX: number,
    originZ: number,
  ): void {
    const noise = this.terrainGenerator.treeCountNoise.sample2D(originX * 0.5, originZ * 0.5);
    const noiseTrees = Math.trunc((noise / 8 + this.random.nextDouble() * 4 + 4) / 3);

    let count = 0;
    if (this.random.nextInt(10) === 0) count++;

    if (biomeId === 'forest' || biomeId === 'rainforest' || biomeId === 'seasonalForest' || biomeId === 'taiga') {
      count += noiseTrees;
    }

    if (biomeId === 'forest') count += 5;
    if (biomeId === 'rainforest') count += 5;
    if (biomeId === 'seasonalForest') count += 2;
    if (biomeId === 'taiga') count += 5;
    if (biomeId === 'desert') count -= 20;
    if (biomeId === 'tundra') count -= 20;
    if (biomeId === 'plains') count -= 20;

    if (count <= 0) return;

    for (let i = 0; i < count; i++) {
      const x = originX + this.random.nextInt(CHUNK_SIZE_X) + 8;
      const z = originZ + this.random.nextInt(CHUNK_SIZE_Z) + 8;
      const y = scratch.getHeight(x, z);
      this.generateTreeForBiome(scratch, biomeId, x, y, z);
    }
  }

  private generateTreeForBiome(
    scratch: ScratchTreeWorld,
    biomeId: BiomeId,
    x: number,
    y: number,
    z: number,
  ): void {
    if (biomeId === 'forest') {
      if (this.random.nextInt(5) === 0) {
        this.birchTree.generate(scratch, this.random, x, y, z);
        return;
      }
      if (this.random.nextInt(3) === 0) {
        const big = new BigTreeGenerator();
        big.configure(1, 1, 1);
        big.generate(scratch, this.random, x, y, z);
        return;
      }
      this.treeGenerator.generate(scratch, this.random, x, y, z);
      return;
    }

    if (biomeId === 'taiga') {
      if (this.random.nextInt(3) === 0) this.taigaTree1.generate(scratch, this.random, x, y, z);
      else this.taigaTree2.generate(scratch, this.random, x, y, z);
      return;
    }

    if (biomeId === 'rainforest') {
      if (this.random.nextInt(3) === 0) {
        const big = new BigTreeGenerator();
        big.configure(1, 1, 1);
        big.generate(scratch, this.random, x, y, z);
      } else {
        this.treeGenerator.generate(scratch, this.random, x, y, z);
      }
      return;
    }

    if (this.random.nextInt(10) === 0) {
      const big = new BigTreeGenerator();
      big.configure(1, 1, 1);
      big.generate(scratch, this.random, x, y, z);
    } else {
      this.treeGenerator.generate(scratch, this.random, x, y, z);
    }
  }

  private sampleChunkBiome(chunkX: number, chunkZ: number): BiomeId {
    const [climate] = this.climateSampler.sampleRegion(
      chunkX * CHUNK_SIZE_X + 16,
      chunkZ * CHUNK_SIZE_Z + 16,
      1,
      1,
    );
    return selectBiome(climate!).id;
  }
}
