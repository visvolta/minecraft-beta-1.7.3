/**
 * Canonical chunk-coordinate key used as a Map/Set key throughout the project.
 *
 * This module is intentionally dependency-free: many subsystems (entities,
 * rendering, persistence, world streaming, tree generation) need a chunk key
 * and importing a heavy module would create circular dependencies.
 *
 * Format: `"${chunkX},${chunkZ}"` — matches every previous inline helper that
 * was consolidated into this file.
 */
export function chunkKey(chunkX: number, chunkZ: number): string {
  return `${chunkX},${chunkZ}`;
}
