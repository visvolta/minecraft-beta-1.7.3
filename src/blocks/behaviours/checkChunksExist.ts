import { CHUNK_SIZE_Y } from '../../world/chunkConstants';

/**
 * Minimal interface for the world-lookup required by `checkChunksExist`.
 *
 * Both LeafBehaviour and LogBehaviour pass `BlockBehaviourContext['world']`
 * (i.e. `BlockUpdateWorld`), which satisfies this structural type. Using a
 * narrow interface here avoids pulling `BlockUpdateWorld` — and its entire
 * transitive import graph — into this leaf module.
 */
export interface ChunkExistenceWorld {
  isLoaded(worldX: number, worldZ: number): boolean;
}

/**
 * Returns true when every chunk column that overlaps the axis-aligned box
 * `(x1,y1,z1)–(x2,y2,z2)` is currently loaded **and** the box overlaps the
 * valid world-height range `[0, CHUNK_SIZE_Y)`.
 *
 * Chunk existence is approximated by X/Z only (Beta behaviour: Y is not
 * chunked). Height is clamped separately so a box entirely above or below
 * the world is rejected even when its X/Z columns happen to be loaded.
 *
 * Shared by LeafBehaviour (leaf decay BFS bounds check) and LogBehaviour
 * (log-removal neighbour scan).
 */
export function checkChunksExist(
  world: ChunkExistenceWorld,
  x1: number,
  y1: number,
  z1: number,
  x2: number,
  y2: number,
  z2: number,
): boolean {
  const minChunkX = Math.floor(Math.min(x1, x2) / 16);
  const maxChunkX = Math.floor(Math.max(x1, x2) / 16);
  const minChunkZ = Math.floor(Math.min(z1, z2) / 16);
  const maxChunkZ = Math.floor(Math.max(z1, z2) / 16);

  for (let cx = minChunkX; cx <= maxChunkX; cx++) {
    for (let cz = minChunkZ; cz <= maxChunkZ; cz++) {
      if (!world.isLoaded(cx * 16, cz * 16)) {
        return false;
      }
    }
  }

  if (Math.max(y1, y2) < 0 || Math.min(y1, y2) >= CHUNK_SIZE_Y) {
    return false;
  }

  return true;
}
