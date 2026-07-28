import { chunkKey } from '../../chunkKey';
import type { GeneratedChunkFeatures } from './GeneratedChunkFeatures';
import { emptyGeneratedFeatures } from './GeneratedChunkFeatures';

/**
 * In-memory side channel for dungeon TE data produced during chunk generation.
 * Works for both main-thread and worker paths when the worker posts features
 * back with the chunk payload (see chunkGenerationWorker).
 */
const byChunk = new Map<number, GeneratedChunkFeatures>();

export function storeGeneratedFeatures(
  chunkX: number,
  chunkZ: number,
  features: GeneratedChunkFeatures,
): void {
  byChunk.set(chunkKey(chunkX, chunkZ), features);
}

export function takeGeneratedFeatures(chunkX: number, chunkZ: number): GeneratedChunkFeatures {
  const key = chunkKey(chunkX, chunkZ);
  const features = byChunk.get(key) ?? emptyGeneratedFeatures();
  byChunk.delete(key);
  return features;
}

export function peekGeneratedFeatures(chunkX: number, chunkZ: number): GeneratedChunkFeatures | undefined {
  return byChunk.get(chunkKey(chunkX, chunkZ));
}
