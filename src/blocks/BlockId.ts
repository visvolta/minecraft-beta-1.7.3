/**
 * Known Minecraft Beta 1.7.3 block IDs used by this project.
 * Lookups still accept any number; this map documents the canonical set.
 */
export const BlockIds = {
  Air: 0,
  Stone: 1,
  Grass: 2,
  Dirt: 3,
  Cobblestone: 4,
  Bedrock: 7,
} as const;

/** Numeric block ID (Beta 1.7.3 compatible). */
export type BlockId = number;

export type KnownBlockId = (typeof BlockIds)[keyof typeof BlockIds];
