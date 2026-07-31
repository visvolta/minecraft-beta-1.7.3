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
import { EMPTY_GENERATION_STAGE_TIMINGS } from './GenerationStageTimings';

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
   *
   * Wave 1A adds detailed decoration buckets and neighbor-generation attribution.
   */
  public readonly lastStageTimings: GenerationStageTimings = {
    ...EMPTY_GENERATION_STAGE_TIMINGS,
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

    // Reset to empty before decoration so partial failures don't leave stale data
    Object.assign(t, EMPTY_GENERATION_STAGE_TIMINGS);

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

    // Base stages
    t.terrainMs = t1 - t0;
    t.surfaceMs = t2 - t1;
    t.cavesMs = t3 - t2;
    // decorationMs will be overwritten by detailed instrumentation below, but keep fallback
    const fallbackDecorationMs = t4 - t3;
    t.snowIceMs = t5 - t4;
    t.totalMs = t5 - t0;

    // Merge detailed decoration instrumentation if available (Wave 1A)
    const instr = this.treeDecorator.getLastInstrumentation();
    if (instr !== undefined && instr !== null) {
      const d = instr.timings;
      t.decorationMs = d.decorationMs || fallbackDecorationMs;
      t.lakeMs = d.lakeMs;
      t.dungeonMs = d.dungeonMs;
      t.clayMs = d.clayMs;
      t.oreMs = d.oreMs;
      t.treeMs = d.treeMs;
      t.vegetationMs = d.vegetationMs;
      t.springMs = d.springMs;
      t.intentionalExtrasMs = d.intentionalExtrasMs;
      t.decorationOverheadMs = d.decorationOverheadMs;

      t.neighborBaseGenerationMs = d.neighborBaseGenerationMs;
      t.neighborTerrainMs = d.neighborTerrainMs;
      t.neighborSurfaceMs = d.neighborSurfaceMs;
      t.neighborCavesMs = d.neighborCavesMs;
      t.neighborChunksGenerated = d.neighborChunksGenerated;
      t.neighborCacheHits = d.neighborCacheHits;
      t.neighborCacheMisses = d.neighborCacheMisses;

      t.blockReads = d.blockReads;
      t.blockWrites = d.blockWrites;
      t.chunkLookups = d.chunkLookups;
      t.heightQueries = d.heightQueries;

      t.treeCalls = d.treeCalls;
      t.treeAttempts = d.treeAttempts;
      t.treePlacements = d.treePlacements;

      t.oreVeins = d.oreVeins;
      t.clayVeins = d.clayVeins;
      t.dungeonAttempts = d.dungeonAttempts;
      t.dungeonPlacements = d.dungeonPlacements;
      t.lakeAttempts = d.lakeAttempts;
      t.lakePlacements = d.lakePlacements;
      t.vegetationAttempts = d.vegetationAttempts;
      t.springAttempts = d.springAttempts;
    } else {
      // Fallback – no instrumentation (e.g., enableTrees false)
      t.decorationMs = fallbackDecorationMs;
    }

    // Ensure totalMs includes all
    t.totalMs = t.terrainMs + t.surfaceMs + t.cavesMs + t.decorationMs + t.snowIceMs;

    if (!chunk.isTerrainPopulated()) {
      chunk.loadGeneratedBlocks(raw.blocks);
      chunk.loadGeneratedMetadata(metadata);
      chunk.setTerrainPopulated(true);
    }
  }
}
