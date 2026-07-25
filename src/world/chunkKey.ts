/**
 * Canonical numeric chunk-coordinate key used as a Map/Set key throughout the project.
 *
 * Beta worlds remain well inside the supported 22-bit signed chunk-coordinate range.
 * Arithmetic packing is used instead of bitwise operators so the key remains exact
 * for negative coordinates and does not truncate through JavaScript's 32-bit shifts.
 */
const CHUNK_KEY_OFFSET = 2_097_152;
const CHUNK_KEY_RADIX = 4_194_304;

export function chunkKey(chunkX: number, chunkZ: number): number {
  return (chunkX + CHUNK_KEY_OFFSET) * CHUNK_KEY_RADIX + (chunkZ + CHUNK_KEY_OFFSET);
}
