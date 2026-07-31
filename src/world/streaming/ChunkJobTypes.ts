/**
 * Identity of the world context a job belongs to.
 *
 * dimensionId alone is not sufficient: a context can be disposed and
 * recreated (re-entering a dimension) while an old worker result is still in
 * flight, so a monotonic generation counter is included. Results whose
 * identity does not match the live context are rejected rather than
 * integrated into the wrong world.
 */

import type { GenerationStageTimings } from '../generation/GenerationStageTimings';
export interface WorldContextIdentity {
  readonly worldId: string;
  readonly dimensionId: number;
  readonly contextGeneration: number;
}

export interface ChunkGenerationJob {
  readonly type: 'generate';
  readonly jobId: number;
  readonly chunkX: number;
  readonly chunkZ: number;
  readonly seed: string;
  /** Which world context requested this chunk. */
  readonly context: WorldContextIdentity;
  /** Dimension-specific generator selector (e.g. 'overworld', 'nether'). */
  readonly generatorKind: string;
  /** Skip skylight projection for dimensions without a sky. */
  readonly hasSkyLight: boolean;
}

export interface ChunkGenerationResult {
  readonly type: 'generated';
  readonly jobId: number;
  /** Echoed back so the main thread can reject stale/cross-dimension results. */
  readonly context: WorldContextIdentity;
  readonly chunkX: number;
  readonly chunkZ: number;
  readonly blocks: ArrayBuffer;
  readonly metadata: ArrayBuffer;
  /**
   * Chunk-local initial lighting computed in the worker via the shared
   * `computeInitialChunkLight` module (skylight LOW nibble, blocklight HIGH
   * nibble, matching Chunk's storage). The main thread adopts this instead of recomputing the same BFS,
   * and still performs border reconciliation itself.
   */
  readonly light: ArrayBuffer;
  readonly durationMs: number;
  /**
   * Per-stage generation attribution (terrain/surface/caves/decoration/snow).
   * Diagnostic only; absent for generators that do not report it.
   */
  readonly stageTimings?: GenerationStageTimings;
  /** JSON-serialized GeneratedChunkFeatures (optional for back-compat). */
  readonly featuresJson?: string;
}

export interface ChunkWorkerError {
  readonly type: 'error';
  readonly jobId: number;
  readonly message: string;
}
