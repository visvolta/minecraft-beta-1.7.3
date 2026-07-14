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
  /** Still water (Beta's flowing-water id 8 is not used; terrain generates only still water). */
  Water: 9,
  /**
   * Flowing lava (Beta 1.7.3 real id). Cave generation (Stage 12B)
   * places this exact id for carved blocks below world Y=10, matching
   * MapGenCaves's `Block.C` (flowing lava) placement precisely — real
   * Beta does not place stationary lava (id 11) during cave carving.
   * Like Water, this project has no fluid-flow simulation; Lava is
   * static world data + a still (non-animated) render, the same
   * deliberate deferral already applied to Water.
   */
  Lava: 10,
  Sand: 12,
  Gravel: 13,
  /** Real Beta 1.7.3 id; registered for future use, not placed by Stage 12A terrain. */
  Clay: 82,
  /**
   * TEMPORARY, project-internal ID — NOT Beta-compatible storage.
   * Real Beta 1.7.3 represents Podzol as Dirt (id 3) with block-metadata
   * value 2; this project's Chunk storage is a single byte per cell with
   * no metadata channel yet, so Podzol cannot be represented that way.
   * This id is a placeholder occupying unused space above Beta's real
   * block-id range (which tops out well below 256) purely so Podzol can
   * be registered and rendered; it must be remapped to proper
   * id+metadata storage if/when that's added. Never generated naturally.
   */
  Podzol: 254,
} as const;

/** Numeric block ID (Beta 1.7.3 compatible). */
export type BlockId = number;

export type KnownBlockId = (typeof BlockIds)[keyof typeof BlockIds];
