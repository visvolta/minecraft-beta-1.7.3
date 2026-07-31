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
import type { ScratchWorldStats } from './TreeWorldAccessor';
import { BlockIds } from '../../../blocks/BlockId';
import { WorldGenLakes } from '../decoration/WorldGenLakes';
import { WorldGenDungeons } from '../decoration/WorldGenDungeons';
import { BetaBiomeDecorator } from '../decoration/BetaBiomeDecorator';
import { IntentionalTerrainExtras } from '../decoration/IntentionalTerrainExtras';
import { DungeonFeatureCollector } from '../decoration/DungeonFeatureCollector';
import type { GeneratedDungeonFeature } from '../decoration/GeneratedChunkFeatures';
import type { GenerationStageTimings } from '../GenerationStageTimings';
import { EMPTY_GENERATION_STAGE_TIMINGS } from '../GenerationStageTimings';

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

export interface DecorationInstrumentation {
  timings: GenerationStageTimings;
  scratchStats: ScratchWorldStats;
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

  private lastInstrumentation: DecorationInstrumentation | null = null;

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

  public getLastInstrumentation(): DecorationInstrumentation | null {
    return this.lastInstrumentation;
  }

  public decorate(
    targetChunkX: number,
    targetChunkZ: number,
    targetBlocks: Uint8Array,
    targetMetadata?: Uint8Array,
  ): Uint8Array {
    const overallStart = performance.now();
    const metadata = targetMetadata ?? new Uint8Array(targetBlocks.length);
    const scratch = new ScratchTreeWorld(this.worldSeed, this.terrainGenerator, this.enableCaves);
    scratch.seedTargetChunk(targetChunkX, targetChunkZ, targetBlocks, metadata);

    // Only record dungeons whose spawner/chests fall inside the target chunk.
    this.dungeonCollector.takeFeatures();
    this.biomeDecorator.resetTimings();

    // Accumulators for high-level buckets – these sum to decorationMs minus overhead
    let lakeMs = 0;
    let dungeonMs = 0;
    let clayMs = 0;
    let oreMs = 0;
    let treeMs = 0;
    let vegetationMs = 0;
    let springMs = 0;
    let intentionalExtrasMs = 0;
    let decorationOverheadMs = 0;

    let lakeAttempts = 0;
    let lakePlacements = 0;
    let dungeonAttempts = 0;
    let treeCalls = 0;
    let treeAttempts = 0;
    let treePlacements = 0;

    for (let sourceX = targetChunkX - NEIGHBOUR_RADIUS; sourceX <= targetChunkX + NEIGHBOUR_RADIUS; sourceX++) {
      for (let sourceZ = targetChunkZ - NEIGHBOUR_RADIUS; sourceZ <= targetChunkZ + NEIGHBOUR_RADIUS; sourceZ++) {
        const srcOverheadStart = performance.now();
        const originX = sourceX * CHUNK_SIZE_X;
        const originZ = sourceZ * CHUNK_SIZE_Z;

        this.random.setSeed(this.worldSeed);
        const i1 = (this.random.nextLong() / 2n) * 2n + 1n;
        const j1 = (this.random.nextLong() / 2n) * 2n + 1n;
        this.random.setSeed(BigInt(sourceX) * i1 + BigInt(sourceZ) * j1 ^ this.worldSeed);

        const biomeSampleStart = performance.now();
        const biomeId = this.sampleChunkBiome(sourceX, sourceZ);
        decorationOverheadMs += performance.now() - biomeSampleStart;

        // ---- Lakes ----
        const lakeStart = performance.now();
        let lakeAttemptedThisSource = 0;
        if (this.random.nextInt(4) === 0) {
          lakeAttemptedThisSource++;
          const rx = originX + this.random.nextInt(16) + 8;
          const ry = this.random.nextInt(128);
          const rz = originZ + this.random.nextInt(16) + 8;
          const placed = this.waterLakeGen.generate(scratch, this.random, rx, ry, rz);
          if (placed) lakePlacements++;
        }
        if (this.random.nextInt(8) === 0) {
          lakeAttemptedThisSource++;
          const rx = originX + this.random.nextInt(16) + 8;
          const ry = this.random.nextInt(this.random.nextInt(120) + 8);
          const rz = originZ + this.random.nextInt(16) + 8;
          if (ry < 64 || this.random.nextInt(10) === 0) {
            const placed = this.lavaLakeGen.generate(scratch, this.random, rx, ry, rz);
            if (placed) lakePlacements++;
          }
        }
        lakeMs += performance.now() - lakeStart;
        lakeAttempts += lakeAttemptedThisSource;

        // ---- Dungeons ----
        const dungeonStart = performance.now();
        for (let d = 0; d < 8; d++) {
          const rx = originX + this.random.nextInt(16) + 8;
          const ry = this.random.nextInt(128);
          const rz = originZ + this.random.nextInt(16) + 8;
          const placed = this.dungeonGen.generate(scratch, this.random, rx, ry, rz);
          dungeonAttempts++;
          if (placed) {
            // placements tracked via collector, but count attempt success here as placement
          }
        }
        dungeonMs += performance.now() - dungeonStart;

        // ---- Underground (clay + ores) ----
        const undergroundStart = performance.now();
        const beforeUnderground = this.biomeDecorator.getLastTimings();
        this.biomeDecorator.generateUnderground(scratch, this.random, originX, originZ);
        const afterUnderground = this.biomeDecorator.getLastTimings();
        const undergroundDeltaMs = performance.now() - undergroundStart;
        // generateUnderground already accumulated into decorator's internal timings;
        // we attribute its wall time to clay+ore buckets via decorator's own per-feature timers,
        // but also keep overall for overhead sanity. The decorator's per-feature timers are more precise.
        // For Wave1A we trust decorator's internal split.
        void undergroundDeltaMs;

        // ---- Trees ----
        const treeStart = performance.now();
        const treesBefore = treeCalls;
        this.placeBiomeTreesInstrumented(scratch, biomeId, originX, originZ, (calls, attempts, placements) => {
          treeCalls += calls;
          treeAttempts += attempts;
          treePlacements += placements;
        });
        treeMs += performance.now() - treeStart;
        void treesBefore;

        // ---- Surface (vegetation + springs) ----
        // generateSurface internal timing splits vegetation vs springs via its own _lastTimings
        const surfaceStart = performance.now();
        const beforeSurface = this.biomeDecorator.getLastTimings();
        this.biomeDecorator.generateSurface(scratch, biomeId, originX, originZ);
        const afterSurface = this.biomeDecorator.getLastTimings();
        void beforeSurface;
        void afterSurface;
        // surface overall time will be accounted via decorator's vegetationMs+springMs, not here

        // ---- Intentional extras ----
        if (this.enableIntentionalExtras) {
          const extrasStart = performance.now();
          this.intentionalExtras.apply(scratch, sourceX, sourceZ, biomeId);
          intentionalExtrasMs += performance.now() - extrasStart;
        }

        decorationOverheadMs += performance.now() - srcOverheadStart;
        // Subtract the measured feature times from overhead to avoid double counting
        // The srcOverheadStart includes everything; we want overhead = total loop - sum(features)
        // For simplicity Wave1A we compute overhead as remainder later.
      }
    }

    // Now collect decorator's aggregated timings (clay, ore, vegetation, spring)
    const decoratorTimings = this.biomeDecorator.getLastTimings();
    clayMs = decoratorTimings.clayMs;
    oreMs = decoratorTimings.oreMs;
    vegetationMs = decoratorTimings.vegetationMs;
    springMs = decoratorTimings.springMs;

    // Decoration overhead = total loop time - sum(measured buckets excluding overhead itself)
    // We measured overallStart to now, but better compute as remainder:
    const totalLoopMs = performance.now() - overallStart;
    const sumBuckets = lakeMs + dungeonMs + clayMs + oreMs + treeMs + vegetationMs + springMs + intentionalExtrasMs;
    decorationOverheadMs = Math.max(0, totalLoopMs - sumBuckets);

    const scratchStats = scratch.getStats();

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

    const decorationMs = performance.now() - overallStart;

    // Build full GenerationStageTimings for this decoration pass (other stages filled by caller)
    // Note: terrain/surface/caves/snowIce/total will be overwritten by BetaWorldGenerator, but we store
    // our sub-buckets here for later merging.
    const tempTimings: GenerationStageTimings = {
      ...EMPTY_GENERATION_STAGE_TIMINGS,
      decorationMs,
      lakeMs,
      dungeonMs,
      clayMs,
      oreMs,
      treeMs,
      vegetationMs,
      springMs,
      intentionalExtrasMs,
      decorationOverheadMs,

      neighborBaseGenerationMs: scratchStats.neighborBaseMs,
      neighborTerrainMs: scratchStats.neighborTerrainMs,
      neighborSurfaceMs: scratchStats.neighborSurfaceMs,
      neighborCavesMs: scratchStats.neighborCavesMs,
      neighborChunksGenerated: scratchStats.neighborChunksGenerated,
      neighborCacheHits: scratchStats.neighborCacheHits,
      neighborCacheMisses: scratchStats.neighborCacheMisses,

      blockReads: scratchStats.blockReads,
      blockWrites: scratchStats.blockWrites,
      chunkLookups: scratchStats.chunkLookups,
      heightQueries: scratchStats.heightQueries,

      treeCalls,
      treeAttempts,
      treePlacements,

      oreVeins: decoratorTimings.oreVeins,
      clayVeins: decoratorTimings.clayVeins,
      dungeonAttempts,
      dungeonPlacements: 0, // placements tracked via collector but not critical for Wave1A
      lakeAttempts,
      lakePlacements,
      vegetationAttempts: decoratorTimings.vegetationAttempts,
      springAttempts: decoratorTimings.springAttempts,
    };

    this.lastInstrumentation = {
      timings: tempTimings,
      scratchStats,
    };

    return metadata;
  }

  private placeBiomeTrees(
    scratch: ScratchTreeWorld,
    biomeId: BiomeId,
    originX: number,
    originZ: number,
  ): void {
    // Legacy plain version – not used in instrumented path, kept for reference
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

  private placeBiomeTreesInstrumented(
    scratch: ScratchTreeWorld,
    biomeId: BiomeId,
    originX: number,
    originZ: number,
    onCounts: (calls: number, attempts: number, placements: number) => void,
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

    if (count <= 0) {
      onCounts(0, 0, 0);
      return;
    }

    let attempts = 0;
    let placements = 0;
    for (let i = 0; i < count; i++) {
      const x = originX + this.random.nextInt(CHUNK_SIZE_X) + 8;
      const z = originZ + this.random.nextInt(CHUNK_SIZE_Z) + 8;
      const y = scratch.getHeight(x, z);
      attempts++;
      const placed = this.generateTreeForBiomeWithResult(scratch, biomeId, x, y, z);
      if (placed) placements++;
    }
    onCounts(1, attempts, placements);
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

  private generateTreeForBiomeWithResult(
    scratch: ScratchTreeWorld,
    biomeId: BiomeId,
    x: number,
    y: number,
    z: number,
  ): boolean {
    if (biomeId === 'forest') {
      if (this.random.nextInt(5) === 0) {
        return this.birchTree.generate(scratch, this.random, x, y, z);
      }
      if (this.random.nextInt(3) === 0) {
        const big = new BigTreeGenerator();
        big.configure(1, 1, 1);
        return big.generate(scratch, this.random, x, y, z);
      }
      return this.treeGenerator.generate(scratch, this.random, x, y, z);
    }

    if (biomeId === 'taiga') {
      if (this.random.nextInt(3) === 0) return this.taigaTree1.generate(scratch, this.random, x, y, z);
      else return this.taigaTree2.generate(scratch, this.random, x, y, z);
    }

    if (biomeId === 'rainforest') {
      if (this.random.nextInt(3) === 0) {
        const big = new BigTreeGenerator();
        big.configure(1, 1, 1);
        return big.generate(scratch, this.random, x, y, z);
      } else {
        return this.treeGenerator.generate(scratch, this.random, x, y, z);
      }
    }

    if (this.random.nextInt(10) === 0) {
      const big = new BigTreeGenerator();
      big.configure(1, 1, 1);
      return big.generate(scratch, this.random, x, y, z);
    } else {
      return this.treeGenerator.generate(scratch, this.random, x, y, z);
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
