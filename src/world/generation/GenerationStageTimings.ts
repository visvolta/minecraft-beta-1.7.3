/**
 * Per-stage wall-clock cost of generating one chunk, in milliseconds.
 *
 * Attribution only: nothing in simulation reads these, and they are never
 * used for correctness or determinism. They exist so the profiler can report
 * which generation stage actually dominates worker time rather than a single
 * opaque `populate` figure.
 *
 * Produced inside the generation worker and forwarded with the chunk result.
 *
 * Wave 1A adds detailed decoration buckets and neighbor-generation attribution
 * so we can prove where the ~300-400ms decoration cost comes from.
 */

export interface GenerationStageTimings {
  /** Base terrain noise + block placement. */
  readonly terrainMs: number;
  /** Surface/biome material pass. */
  readonly surfaceMs: number;
  /** Cave carving. */
  readonly cavesMs: number;
  /** Trees, ores, lakes, dungeons and other decorators (\"populate\" in Beta). */
  readonly decorationMs: number;
  /** Snow/ice pass – separate post-decoration stage, NOT part of decorationMs. */
  readonly snowIceMs: number;
  /** Sum of the stages above (terrain+surface+caves+decoration+snowIce). */
  readonly totalMs: number;

  // ------------------------------------------------------------------------
  // High-level decoration buckets – sum of lake+dungeon+clay+ore+tree+
  // vegetation+spring+intentionalExtras+overhead ≈ decorationMs.
  // snowIceMs is intentionally outside this equation.
  // ------------------------------------------------------------------------
  /** Lake generation (water + lava lakes). */
  readonly lakeMs: number;
  /** Dungeon generation (8 attempts per source). */
  readonly dungeonMs: number;
  /** Clay generation (10 per source). */
  readonly clayMs: number;
  /** Ore generation (dirt, gravel, coal, iron, gold, redstone, diamond, lapis). */
  readonly oreMs: number;
  /** Tree placement (noise + count + per-tree generation). */
  readonly treeMs: number;
  /** Surface vegetation: flowers, tall grass/fern, dead bush, mushrooms, reed, pumpkin, cactus. */
  readonly vegetationMs: number;
  /** Springs: water 50 + lava 20 per source. */
  readonly springMs: number;
  /** Intentional extras (taiga/OGST extras, separate RNG). */
  readonly intentionalExtrasMs: number;
  /** Loop overhead, biome sampling, RNG seeding, etc. */
  readonly decorationOverheadMs: number;

  // ------------------------------------------------------------------------
  // Hidden neighbor base-generation cost – time spent inside
  // ScratchTreeWorld.ensureChunk() generating raw terrain+surface+caves for
  // the 25 neighbor chunks. This is currently accounted inside decorationMs
  // but needs explicit attribution to validate the LRU hypothesis.
  // ------------------------------------------------------------------------
  /** Total time in ensureChunk raw generation (terrain+surface+caves). */
  readonly neighborBaseGenerationMs: number;
  /** Sub-parts of neighborBaseGenerationMs. */
  readonly neighborTerrainMs: number;
  readonly neighborSurfaceMs: number;
  readonly neighborCavesMs: number;
  /** Counts for cache tuning (hits always 0 in Wave1A, but fields exist). */
  readonly neighborChunksGenerated: number;
  readonly neighborCacheHits: number;
  readonly neighborCacheMisses: number;

  // ------------------------------------------------------------------------
  // I/O and call counts – diagnostic only, for allocation/GC and lookup
  // analysis. Not timed, just counters.
  // ------------------------------------------------------------------------
  readonly blockReads: number;
  readonly blockWrites: number;
  readonly chunkLookups: number;
  readonly heightQueries: number;

  readonly treeCalls: number;
  readonly treeAttempts: number;
  readonly treePlacements: number;

  readonly oreVeins: number;
  readonly clayVeins: number;
  readonly dungeonAttempts: number;
  readonly dungeonPlacements: number;
  readonly lakeAttempts: number;
  readonly lakePlacements: number;
  readonly vegetationAttempts: number;
  readonly springAttempts: number;
}

/** All-zero timings, for generators that do not report stage attribution. */
export const EMPTY_GENERATION_STAGE_TIMINGS: GenerationStageTimings = {
  terrainMs: 0,
  surfaceMs: 0,
  cavesMs: 0,
  decorationMs: 0,
  snowIceMs: 0,
  totalMs: 0,

  lakeMs: 0,
  dungeonMs: 0,
  clayMs: 0,
  oreMs: 0,
  treeMs: 0,
  vegetationMs: 0,
  springMs: 0,
  intentionalExtrasMs: 0,
  decorationOverheadMs: 0,

  neighborBaseGenerationMs: 0,
  neighborTerrainMs: 0,
  neighborSurfaceMs: 0,
  neighborCavesMs: 0,
  neighborChunksGenerated: 0,
  neighborCacheHits: 0,
  neighborCacheMisses: 0,

  blockReads: 0,
  blockWrites: 0,
  chunkLookups: 0,
  heightQueries: 0,

  treeCalls: 0,
  treeAttempts: 0,
  treePlacements: 0,

  oreVeins: 0,
  clayVeins: 0,
  dungeonAttempts: 0,
  dungeonPlacements: 0,
  lakeAttempts: 0,
  lakePlacements: 0,
  vegetationAttempts: 0,
  springAttempts: 0,
};
