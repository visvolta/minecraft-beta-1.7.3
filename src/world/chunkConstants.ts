/** Minecraft Beta 1.7.3 chunk dimensions (blocks). */
export const CHUNK_SIZE_X = 16;
export const CHUNK_SIZE_Y = 128;
export const CHUNK_SIZE_Z = 16;

/** Total blocks per chunk: 16 × 128 × 16. */
export const CHUNK_VOLUME = CHUNK_SIZE_X * CHUNK_SIZE_Y * CHUNK_SIZE_Z;

/** Default / empty block ID (Air). */
export const AIR_BLOCK_ID = 0;

/**
 * Minimum world Y. Living entities below this height take repeated void
 * damage (Beta kills below -64). Shared so the value is configured in one
 * place rather than hardcoded at the use site.
 */
export const VOID_MIN_Y = -64;
