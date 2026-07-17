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
  /** Beta 1.7.3 flowing water. */
  WaterFlowing: 8,
  /** Beta 1.7.3 stationary/source water. */
  WaterStill: 9,
  /** Temporary compatibility alias; new code should use WaterStill. */
  Water: 9,
  /** Beta 1.7.3 flowing lava. */
  LavaFlowing: 10,
  /** Temporary compatibility alias; new code should use LavaFlowing. */
  Lava: 10,
  Sand: 12,
  Gravel: 13,
  /** Real Beta 1.7.3 id (Oak wood log). Metadata 0 = Oak in real Beta; see SpruceLog for why a second species needs its own id here. */
  Log: 17,
  /** Real Beta 1.7.3 id (Oak leaves). Metadata 0 = Oak in real Beta; see SpruceLeaves for why a second species needs its own id here. */
  Leaves: 18,
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
  /**
   * TEMPORARY, project-internal ID — NOT Beta-compatible storage.
   * Real Beta 1.7.3 represents wood species (Oak/Spruce/Birch/Jungle) as
   * a single Log id (17) with block-metadata distinguishing species;
   * this project's Chunk storage has no metadata channel yet, so a
   * second tree species needs its own id, the same placeholder pattern
   * already used for Podzol. Used only by Taiga-biome tree generation
   * (Stage 12C); must be remapped to proper id+metadata storage if/when
   * that's added.
   */
  SpruceLog: 252,
  /** TEMPORARY, project-internal ID — see SpruceLog's doc comment; the Leaves equivalent for the same reason. */
  SpruceLeaves: 253,
  Obsidian: 49,
  MossyCobblestone: 48,
  CoalOre: 16,
  IronOre: 15,
  GoldOre: 14,
  RedstoneOre: 73,
  DiamondOre: 56,
  LapisOre: 21,
  Chest: 54,
  Spawner: 52,
  Dandelion: 37,
  Rose: 38,
  BrownMushroom: 39,
  RedMushroom: 40,
  TallGrass: 31,
  DeadBush: 32,
  Reed: 83,
  Pumpkin: 86,
  Cactus: 81,
  LavaStill: 11,
  Sapling: 6,
  Fire: 51,
  Farmland: 60,
  Crops: 59,
  Snow: 78,
  Ice: 79,
  SnowBlock: 80,
  Torch: 50,
  Ladder: 65,
  SignPost: 63,
  WallSign: 68,
  StoneButton: 77,
  Lever: 69,
  StonePressurePlate: 70,
  WoodDoor: 64,
  RedstoneTorch: 76,
  RedstoneBlock: 152,
  RedstoneLampOff: 123,
  RedstoneLampOn: 124,
} as const;

/** Numeric block ID (Beta 1.7.3 compatible). */
export type BlockId = number;

export type KnownBlockId = (typeof BlockIds)[keyof typeof BlockIds];
