import { Chunk } from '../world/Chunk';
import { BetaWorldGenerator } from '../world/generation/BetaWorldGenerator';
import { NetherWorldGenerator } from '../world/generation/nether/NetherWorldGenerator';
import type { WorldGenerator } from '../world/WorldGenerator';
import type { ChunkGenerationJob, ChunkGenerationResult, ChunkWorkerError } from '../world/streaming/ChunkJobTypes';
import type { GeneratedChunkFeatures } from '../world/generation/decoration/GeneratedChunkFeatures';
import { BlockRegistry } from '../blocks/BlockRegistry';
import { registerDefaultBlocks } from '../blocks/registerDefaultBlocks';
import { buildLightLookupTables, computeInitialChunkLight } from '../world/generation/lighting/initialChunkLight';
import { getGlobalRawTerrainCache } from '../world/generation/RawTerrainCache';

let generatorSeed: string | null = null;
let generatorKind: string | null = null;
let generator: WorldGenerator | null = null;

const lightRegistry = new BlockRegistry();
registerDefaultBlocks(lightRegistry);
const lightTables = buildLightLookupTables(lightRegistry);

function getGenerator(seed: string, kind: string): WorldGenerator {
  const rawCache = kind === 'overworld' ? getGlobalRawTerrainCache() : null;
  if (generator === null || generatorSeed !== seed || generatorKind !== kind) {
    generatorSeed = seed;
    generatorKind = kind;
    if (kind === 'nether') {
      generator = new NetherWorldGenerator(BigInt(seed));
    } else {
      generator = new BetaWorldGenerator(BigInt(seed), {
        rawCache,
        dimensionId: kind,
        generationVersion: 2,
        rawCacheEnabled: true,
      });
      rawCache?.ensureIdentity({
        worldSeed: BigInt(seed),
        dimensionId: kind,
        enableCaves: true,
        generationVersion: 2,
      });
    }
  } else if (rawCache !== null) {
    rawCache.ensureIdentity({
      worldSeed: BigInt(seed),
      dimensionId: kind,
      enableCaves: true,
      generationVersion: 2,
    });
  }
  return generator;
}

const workerSelf = self as unknown as {
  onmessage: ((event: MessageEvent<ChunkGenerationJob>) => void) | null;
  postMessage: (message: ChunkGenerationResult | ChunkWorkerError, transfer?: Transferable[]) => void;
};

workerSelf.onmessage = async (event: MessageEvent<ChunkGenerationJob>): Promise<void> => {
  const job = event.data;
  if (job.type !== 'generate') {
    return;
  }

  try {
    const start = performance.now();
    const chunk = new Chunk(job.chunkX, job.chunkZ);
    const gen = getGenerator(job.seed, job.generatorKind);
    // Wave 4: use async phased population with cooperative yields (8ms budget) to avoid 300-400ms monolith
    if (gen instanceof BetaWorldGenerator) {
      await gen.populateAsync(chunk, 8);
    } else {
      gen.populate(chunk);
    }
    const blocks = chunk.copyBlocks();
    const metadata = chunk.copyMetadata();
    const light = computeInitialChunkLight(blocks, lightTables, { hasSkyLight: job.hasSkyLight });
    const features = gen instanceof BetaWorldGenerator ? gen.getLastGeneratedFeatures() : undefined;
    const blockBuffer = blocks.buffer as ArrayBuffer;
    const metadataBuffer = metadata.buffer as ArrayBuffer;
    const lightBuffer = light.buffer as ArrayBuffer;
    const result: ChunkGenerationResult = {
      type: 'generated',
      jobId: job.jobId,
      context: job.context,
      chunkX: job.chunkX,
      chunkZ: job.chunkZ,
      blocks: blockBuffer,
      metadata: metadataBuffer,
      light: lightBuffer,
      durationMs: performance.now() - start,
      ...(gen instanceof BetaWorldGenerator ? { stageTimings: { ...gen.lastStageTimings } } : {}),
      featuresJson: features === undefined ? '' : serializeFeatures(features),
    };
    workerSelf.postMessage(result, [blockBuffer, metadataBuffer, lightBuffer]);
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
