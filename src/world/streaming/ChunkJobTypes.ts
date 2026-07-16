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
  readonly durationMs: number;
}

export interface ChunkWorkerError {
  readonly type: 'error';
  readonly jobId: number;
  readonly message: string;
}
