/**
 * Per-stage wall-clock cost of generating one chunk, in milliseconds.
 *
 * Attribution only: nothing in simulation reads these, and they are never
 * used for correctness or determinism. They exist so the profiler can report
 * which generation stage actually dominates worker time rather than a single
 * opaque `populate` figure.
 *
 * Produced inside the generation worker and forwarded with the chunk result.
 */
export interface GenerationStageTimings {
  /** Base terrain noise + block placement. */
  readonly terrainMs: number;
  /** Surface/biome material pass. */
  readonly surfaceMs: number;
  /** Cave carving. */
  readonly cavesMs: number;
  /** Trees, ores, lakes, dungeons and other decorators ("populate" in Beta). */
  readonly decorationMs: number;
  /** Snow/ice pass. */
  readonly snowIceMs: number;
  /** Sum of the stages above. */
  readonly totalMs: number;
}

/** All-zero timings, for generators that do not report stage attribution. */
export const EMPTY_GENERATION_STAGE_TIMINGS: GenerationStageTimings = {
  terrainMs: 0,
  surfaceMs: 0,
  cavesMs: 0,
  decorationMs: 0,
  snowIceMs: 0,
  totalMs: 0,
};
