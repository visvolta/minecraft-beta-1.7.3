/**
 * Sanctioned departures from Minecraft Beta 1.7.3 content.
 *
 * Beta 1.7.3 is the source of truth for this project, so anything the game
 * registers that does not exist in Beta must be listed here with a reason.
 * Parity validation reads this list: an unlisted extra item is a failure, not
 * a warning, which is what stops modern content drifting in unnoticed.
 *
 * Numeric ids are chosen from ranges Beta itself never allocates (Beta's item
 * ids stop at 357, plus records at 2256/2257), so a deviation can never
 * collide with real Beta content or with a save written by it.
 */

export interface BetaDeviation {
  /** Project item id. */
  readonly id: string;
  /** Numeric id; must sit outside Beta's allocated ranges. */
  readonly numericId: number;
  /** Why this exists despite not being Beta content. */
  readonly reason: string;
}

/**
 * Explicitly requested additions. Cows and sheep drop meat here even though
 * Beta 1.7.3 gives cows leather only and sheep wool only; chicken meat is
 * included on the same footing because chickens already exist as a mob and
 * dropping only feathers alongside meat-dropping cows/sheep is inconsistent.
 */
export const BETA_ITEM_DEVIATIONS: readonly BetaDeviation[] = [
  { id: 'beef_raw', numericId: 363, reason: 'Requested addition: cows drop beef (Beta cows drop leather only).' },
  { id: 'beef_cooked', numericId: 364, reason: 'Requested addition: smelted counterpart of beef_raw.' },
  { id: 'chicken_raw', numericId: 365, reason: 'Requested addition: consistency with beef/mutton (Beta chickens drop feathers only).' },
  { id: 'chicken_cooked', numericId: 366, reason: 'Requested addition: smelted counterpart of chicken_raw.' },
  { id: 'mutton_raw', numericId: 367, reason: 'Requested addition: sheep drop mutton (Beta sheep drop wool only).' },
  { id: 'mutton_cooked', numericId: 368, reason: 'Requested addition: smelted counterpart of mutton_raw.' },
  { id: 'door_spruce', numericId: 380, reason: 'Requested addition: spruce door (Beta has one wooden door only).' },
  { id: 'door_birch', numericId: 381, reason: 'Requested addition: birch door (Beta has one wooden door only).' },
];

/**
 * Project-internal block ids. Beta stores wood species and podzol as metadata
 * on a shared block id; this project's chunk storage predates a metadata
 * channel for those, so each needs a placeholder id above Beta's range.
 */
export const BETA_BLOCK_DEVIATIONS: readonly BetaDeviation[] = [
  { id: 'birch_leaves', numericId: 250, reason: 'Temporary id: Beta stores birch as Leaves(18) metadata 2.' },
  { id: 'birch_log', numericId: 251, reason: 'Temporary id: Beta stores birch as Log(17) metadata 2.' },
  { id: 'spruce_log', numericId: 252, reason: 'Temporary id: Beta stores spruce as Log(17) metadata 1.' },
  { id: 'spruce_leaves', numericId: 253, reason: 'Temporary id: Beta stores spruce as Leaves(18) metadata 1.' },
  { id: 'podzol', numericId: 254, reason: 'Temporary id: Beta stores podzol as Dirt(3) metadata 2.' },
  { id: 'spruce_planks', numericId: 240, reason: 'Requested addition: Beta has a single Planks(5) block.' },
  { id: 'birch_planks', numericId: 241, reason: 'Requested addition: Beta has a single Planks(5) block.' },
  { id: 'spruce_door', numericId: 242, reason: 'Requested addition: placed form of the spruce door.' },
  { id: 'birch_door', numericId: 243, reason: 'Requested addition: placed form of the birch door.' },
];

const DEVIATION_ITEM_IDS: ReadonlySet<string> = new Set(BETA_ITEM_DEVIATIONS.map((entry) => entry.id));
const DEVIATION_BLOCK_IDS: ReadonlySet<number> = new Set(BETA_BLOCK_DEVIATIONS.map((entry) => entry.numericId));

export function isSanctionedItemDeviation(id: string): boolean {
  return DEVIATION_ITEM_IDS.has(id);
}

export function isSanctionedBlockDeviation(numericId: number): boolean {
  return DEVIATION_BLOCK_IDS.has(numericId);
}
