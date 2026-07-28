import { Chunk } from '../world/Chunk';
import { BetaWorldGenerator } from '../world/generation/BetaWorldGenerator';
import type { ChunkGenerationJob, ChunkGenerationResult, ChunkWorkerError } from '../world/streaming/ChunkJobTypes';
import type { GeneratedChunkFeatures } from '../world/generation/decoration/GeneratedChunkFeatures';

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
    const gen = getGenerator(job.seed);
    gen.populate(chunk);
    const blocks = chunk.copyBlocks();
    const metadata = chunk.copyMetadata();
    const features = gen.getLastGeneratedFeatures();
    const blockBuffer = blocks.buffer as ArrayBuffer;
    const metadataBuffer = metadata.buffer as ArrayBuffer;
    const result: ChunkGenerationResult = {
      type: 'generated',
      jobId: job.jobId,
      chunkX: job.chunkX,
      chunkZ: job.chunkZ,
      blocks: blockBuffer,
      metadata: metadataBuffer,
      durationMs: performance.now() - start,
      featuresJson: serializeFeatures(features),
    };
    workerSelf.postMessage(result, [blockBuffer, metadataBuffer]);
  } catch (error) {
    const result: ChunkWorkerError = {
      type: 'error',
      jobId: job.jobId,
      message: error instanceof Error ? error.message : String(error),
    };
    workerSelf.postMessage(result);
  }
};

function serializeFeatures(features: GeneratedChunkFeatures): string {
  return JSON.stringify({
    dungeons: features.dungeons.map((d) => ({
      spawnerX: d.spawnerX,
      spawnerY: d.spawnerY,
      spawnerZ: d.spawnerZ,
      mobId: d.mobId,
      chests: d.chests.map((c) => ({
        x: c.x,
        y: c.y,
        z: c.z,
        contents: [...c.contents.entries()],
      })),
    })),
  });
}
