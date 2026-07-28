export interface ChunkGenerationJob {
  readonly type: 'generate';
  readonly jobId: number;
  readonly chunkX: number;
  readonly chunkZ: number;
  readonly seed: string;
}

export interface ChunkGenerationResult {
  readonly type: 'generated';
  readonly jobId: number;
  readonly chunkX: number;
  readonly chunkZ: number;
  readonly blocks: ArrayBuffer;
  readonly metadata: ArrayBuffer;
  /**
   * Chunk-local initial lighting computed in the worker via the shared
   * `computeInitialChunkLight` module (skylight high nibble, blocklight low
   * nibble). The main thread adopts this instead of recomputing the same BFS,
   * and still performs border reconciliation itself.
   */
  readonly light: ArrayBuffer;
  readonly durationMs: number;
  /** JSON-serialized GeneratedChunkFeatures (optional for back-compat). */
  readonly featuresJson?: string;
}

export interface ChunkWorkerError {
  readonly type: 'error';
  readonly jobId: number;
  readonly message: string;
}
