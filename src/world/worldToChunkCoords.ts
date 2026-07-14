import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from './chunkConstants';

/** Chunk coordinates plus the local block position within that chunk. */
export interface ChunkLocalPosition {
  readonly chunkX: number;
  readonly chunkZ: number;
  readonly localX: number;
  readonly localZ: number;
}

/**
 * Converts a world-space block X/Z into the owning chunk coordinates and
 * the local X/Z within that chunk. Uses floor division so negative world
 * coordinates map to the correct chunk (e.g. world X = -1 is local X = 15
 * of chunk X = -1, not chunk 0).
 */
export function worldToChunkLocal(worldX: number, worldZ: number): ChunkLocalPosition {
  const chunkX = Math.floor(worldX / CHUNK_SIZE_X);
  const chunkZ = Math.floor(worldZ / CHUNK_SIZE_Z);

  const localX = worldX - chunkX * CHUNK_SIZE_X;
  const localZ = worldZ - chunkZ * CHUNK_SIZE_Z;

  return { chunkX, chunkZ, localX, localZ };
}

/** A neighbouring chunk's coordinates. */
export interface ChunkCoords {
  readonly chunkX: number;
  readonly chunkZ: number;
}

/**
 * Returns the coordinates of orthogonal neighbour chunks that share a face
 * with a block edited at (localX, localZ) within chunk (chunkX, chunkZ).
 * Empty unless the block sits on the edge of its chunk. A block in a
 * corner can return up to two neighbours (one per boundary axis); it never
 * returns a diagonal neighbour, since ChunkMesher only checks the four
 * orthogonal neighbours for face culling.
 */
export function getBoundaryNeighbourChunks(
  chunkX: number,
  chunkZ: number,
  localX: number,
  localZ: number,
): readonly ChunkCoords[] {
  const neighbours: ChunkCoords[] = [];

  if (localX === 0) {
    neighbours.push({ chunkX: chunkX - 1, chunkZ });
  } else if (localX === CHUNK_SIZE_X - 1) {
    neighbours.push({ chunkX: chunkX + 1, chunkZ });
  }

  if (localZ === 0) {
    neighbours.push({ chunkX, chunkZ: chunkZ - 1 });
  } else if (localZ === CHUNK_SIZE_Z - 1) {
    neighbours.push({ chunkX, chunkZ: chunkZ + 1 });
  }

  return neighbours;
}
