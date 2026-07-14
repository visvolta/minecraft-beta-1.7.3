import type { Chunk } from './Chunk';

/**
 * A world generator populates a freshly created, empty Chunk with blocks.
 * ChunkStreamer depends on this interface rather than a concrete
 * generator class, so the terrain implementation can change without
 * touching streaming, storage, or rendering.
 */
export interface WorldGenerator {
  populate(chunk: Chunk): void;
}
