import { Chunk } from '../world/Chunk';
import { BetaWorldGenerator } from '../world/generation/BetaWorldGenerator';
import type { ChunkGenerationJob, ChunkGenerationResult, ChunkWorkerError } from '../world/streaming/ChunkJobTypes';

let generatorSeed: string | null = null;
let generator: BetaWorldGenerator | null = null;

function getGenerator(seed: string): BetaWorldGenerator {
  if (generator === null || generatorSeed !== seed) {
    generatorSeed = seed;
    generator = new BetaWorldGenerator(BigInt(seed));
  }
  return generator;
}

const workerSelf = self as unknown as {
  onmessage: ((event: MessageEvent<ChunkGenerationJob>) => void) | null;
  postMessage: (message: ChunkGenerationResult | ChunkWorkerError, transfer?: Transferable[]) => void;
};

workerSelf.onmessage = (event: MessageEvent<ChunkGenerationJob>): void => {
  const job = event.data;
  if (job.type !== 'generate') {
    return;
  }

  try {
    const start = performance.now();
    const chunk = new Chunk(job.chunkX, job.chunkZ);
    getGenerator(job.seed).populate(chunk);
    const blocks = chunk.copyBlocks();
    const buffer = blocks.buffer as ArrayBuffer;
    const result: ChunkGenerationResult = {
      type: 'generated',
      jobId: job.jobId,
      chunkX: job.chunkX,
      chunkZ: job.chunkZ,
      blocks: buffer,
      durationMs: performance.now() - start,
    };
    workerSelf.postMessage(result, [buffer]);
  } catch (error) {
    const result: ChunkWorkerError = {
      type: 'error',
      jobId: job.jobId,
      message: error instanceof Error ? error.message : String(error),
    };
    workerSelf.postMessage(result);
  }
};
