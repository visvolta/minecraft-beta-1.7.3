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
import type { GenerationStageTimings } from './GenerationStageTimings';

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

  /**
   * Per-stage timings from the most recent {@link populate} call, in ms.
   *
   * Attribution only — nothing reads these for simulation. The generation
   * worker forwards them so the profiler can show which stage actually
   * dominates chunk cost instead of reporting one opaque `populate` number.
   */
  public readonly lastStageTimings: GenerationStageTimings = {
    terrainMs: 0, surfaceMs: 0, cavesMs: 0, decorationMs: 0, snowIceMs: 0, totalMs: 0,
  };

  public populate(chunk: Chunk): void {
    const t = this.lastStageTimings as { -readonly [K in keyof GenerationStageTimings]: number };
    const t0 = performance.now();

    const raw = this.terrainGenerator.generate(chunk.chunkX, chunk.chunkZ);
    const t1 = performance.now();
    this.surfaceGenerator.apply(chunk.chunkX, chunk.chunkZ, raw.blocks, raw.climate);
    const t2 = performance.now();

    if (this.enableCaves) {
      this.caveGenerator.carve(chunk.chunkX, chunk.chunkZ, raw.blocks);
    }
    const t3 = performance.now();

    const metadata = new Uint8Array(CHUNK_SIZE_X * CHUNK_SIZE_Y * CHUNK_SIZE_Z);

    if (this.enableTrees) {
      this.treeDecorator.decorate(chunk.chunkX, chunk.chunkZ, raw.blocks, metadata);
      const dungeons = this.treeDecorator.takePendingDungeons();
      this.lastFeatures = { dungeons };
      storeGeneratedFeatures(chunk.chunkX, chunk.chunkZ, this.lastFeatures);
    } else {
      this.lastFeatures = emptyGeneratedFeatures();
    }
    const t4 = performance.now();

    this.snowIceGenerator.apply(chunk.chunkX, chunk.chunkZ, raw.blocks, raw.climate);
    const t5 = performance.now();

    t.terrainMs = t1 - t0;
    t.surfaceMs = t2 - t1;
    t.cavesMs = t3 - t2;
    t.decorationMs = t4 - t3;
    t.snowIceMs = t5 - t4;
    t.totalMs = t5 - t0;

    if (!chunk.isTerrainPopulated()) {
      chunk.loadGeneratedBlocks(raw.blocks);
      chunk.loadGeneratedMetadata(metadata);
      chunk.setTerrainPopulated(true);
    }
  }
}
