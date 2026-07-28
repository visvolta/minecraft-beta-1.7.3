import type { Chunk } from '../Chunk';
import type { WorldGenerator } from '../WorldGenerator';
import { BetaTerrainGenerator } from './BetaTerrainGenerator';
import { SurfaceGenerator } from './SurfaceGenerator';
import { JavaRandom } from './random/JavaRandom';
import { BetaCaveGenerator } from './caves/BetaCaveGenerator';
import { BetaTreeDecorator } from './trees/BetaTreeDecorator';
import { SnowIceGenerator } from './SnowIceGenerator';
import type { GeneratedChunkFeatures } from './decoration/GeneratedChunkFeatures';
import { emptyGeneratedFeatures } from './decoration/GeneratedChunkFeatures';
import { storeGeneratedFeatures } from './decoration/GeneratedFeaturesRegistry';
import { CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z } from '../chunkConstants';

export interface BetaWorldGeneratorOptions {
  readonly enableCaves?: boolean;
  readonly enableTrees?: boolean;
  /** Intentional taiga/OGST extras (separate RNG). Default true. */
  readonly enableIntentionalExtras?: boolean;
}

/**
 * Beta 1.7.3 chunk pipeline:
 * density → surface → caves → populate (order-independent scratch) → snow/ice.
 */
export class BetaWorldGenerator implements WorldGenerator {
  private readonly terrainGenerator: BetaTerrainGenerator;
  private readonly surfaceGenerator: SurfaceGenerator;
  private readonly caveGenerator: BetaCaveGenerator;
  private readonly treeDecorator: BetaTreeDecorator;
  private readonly snowIceGenerator: SnowIceGenerator;
  private readonly enableCaves: boolean;
  private readonly enableTrees: boolean;

  /** Side-channel features from the most recent populate() call. */
  private lastFeatures: GeneratedChunkFeatures = emptyGeneratedFeatures();

  public constructor(worldSeed: bigint, options: BetaWorldGeneratorOptions = {}) {
    this.terrainGenerator = new BetaTerrainGenerator(worldSeed);
    this.surfaceGenerator = new SurfaceGenerator(
      new JavaRandom(0),
      this.terrainGenerator.surfaceSandNoise,
      this.terrainGenerator.surfaceDepthNoise,
    );
    this.caveGenerator = new BetaCaveGenerator(worldSeed);
    this.enableCaves = options.enableCaves ?? true;
    this.enableTrees = options.enableTrees ?? true;
    this.treeDecorator = new BetaTreeDecorator(worldSeed, this.terrainGenerator, this.enableCaves, {
      enableIntentionalExtras: options.enableIntentionalExtras ?? true,
    });
    this.snowIceGenerator = new SnowIceGenerator();
  }

  public getLastGeneratedFeatures(): GeneratedChunkFeatures {
    return this.lastFeatures;
  }

  public getFirstUncoveredBlock(worldX: number, worldZ: number): { blockId: number; height: number } {
    const chunkX = Math.floor(worldX / 16);
    const chunkZ = Math.floor(worldZ / 16);
    const raw = this.terrainGenerator.generate(chunkX, chunkZ);
    this.surfaceGenerator.apply(chunkX, chunkZ, raw.blocks, raw.climate);

    const localX = worldX & 15;
    const localZ = worldZ & 15;

    let y = 63;
    while (y < 127) {
      const idx = localX + localZ * 16 + (y + 1) * 256;
      if (raw.blocks[idx] === 0) break;
      y++;
    }

    const blockIdx = localX + localZ * 16 + y * 256;
    return { blockId: raw.blocks[blockIdx]!, height: y };
  }

  public populate(chunk: Chunk): void {
    const raw = this.terrainGenerator.generate(chunk.chunkX, chunk.chunkZ);
    this.surfaceGenerator.apply(chunk.chunkX, chunk.chunkZ, raw.blocks, raw.climate);

    if (this.enableCaves) {
      this.caveGenerator.carve(chunk.chunkX, chunk.chunkZ, raw.blocks);
    }

    const metadata = new Uint8Array(CHUNK_SIZE_X * CHUNK_SIZE_Y * CHUNK_SIZE_Z);

    if (this.enableTrees) {
      this.treeDecorator.decorate(chunk.chunkX, chunk.chunkZ, raw.blocks, metadata);
      const dungeons = this.treeDecorator.takePendingDungeons();
      this.lastFeatures = { dungeons };
      storeGeneratedFeatures(chunk.chunkX, chunk.chunkZ, this.lastFeatures);
    } else {
      this.lastFeatures = emptyGeneratedFeatures();
    }

    this.snowIceGenerator.apply(chunk.chunkX, chunk.chunkZ, raw.blocks, raw.climate);

    if (!chunk.isTerrainPopulated()) {
      chunk.loadGeneratedBlocks(raw.blocks);
      chunk.loadGeneratedMetadata(metadata);
      chunk.setTerrainPopulated(true);
    }
  }
}
