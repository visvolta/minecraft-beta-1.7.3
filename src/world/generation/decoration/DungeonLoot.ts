import { JavaRandom } from '../random/JavaRandom';

/**
 * Beta 1.7.3 dungeon chest contents.
 *
 * Faithful port of `WorldGenDungeons.pickCheckLootItem` and `pickMobSpawner`.
 * The exact `nextInt` call sequence matters: it shares the world RNG stream
 * with terrain decoration, so any extra or missing draw shifts every later
 * feature for that seed. Rolls that miss their sub-chance deliberately return
 * null and still consume their draws — Beta leaves those slots empty.
 */

export interface LootStack {
  /** Item string id understood by the item registry. */
  readonly id: string;
  readonly count: number;
  readonly metadata: number;
}

/** Beta rolls the loot table this many times per dungeon chest. */
export const DUNGEON_LOOT_ROLLS = 8;

/** Beta dungeon chests have 27 slots; loot is scattered by `nextInt(size)`. */
export const DUNGEON_CHEST_SLOTS = 27;

/**
 * One roll of Beta's 11-way dungeon loot table.
 *
 * Returns null for an empty roll, which happens both for the `else` branch and
 * for rare items that failed their secondary chance.
 */
export function pickDungeonLootItem(random: JavaRandom): LootStack | null {
  const choice = random.nextInt(11);
  switch (choice) {
    case 0:
      return { id: 'saddle', count: 1, metadata: 0 };
    case 1:
      return { id: 'iron_ingot', count: random.nextInt(4) + 1, metadata: 0 };
    case 2:
      return { id: 'bread', count: 1, metadata: 0 };
    case 3:
      return { id: 'wheat', count: random.nextInt(4) + 1, metadata: 0 };
    case 4:
      return { id: 'gunpowder', count: random.nextInt(4) + 1, metadata: 0 };
    case 5:
      return { id: 'string', count: random.nextInt(4) + 1, metadata: 0 };
    case 6:
      return { id: 'bucket_empty', count: 1, metadata: 0 };
    case 7:
      // Golden apple: 1 in 100.
      return random.nextInt(100) === 0 ? { id: 'apple_golden', count: 1, metadata: 0 } : null;
    case 8:
      // Redstone: 1 in 2, then 1-4 dust.
      return random.nextInt(2) === 0 ? { id: 'redstone_dust', count: random.nextInt(4) + 1, metadata: 0 } : null;
    case 9:
      // Music disc: 1 in 10, choosing between the two Beta records.
      return random.nextInt(10) === 0
        ? { id: random.nextInt(2) === 0 ? 'record_13' : 'record_cat', count: 1, metadata: 0 }
        : null;
    case 10:
      // Beta `new ItemStack(Item.dyePowder, 1, 3)` — cocoa beans (brown).
      return { id: 'dye_powder_brown', count: 1, metadata: 3 };
    default:
      return null;
  }
}

/**
 * Intentional project addition (NOT Beta 1.7.3): a rare Chainmail piece in a
 * dungeon chest. Chainmail is dungeon-only in this project — it has full armor
 * behaviour but NO crafting recipe — so it is obtained this way. Uses a SEPARATE
 * RNG seeded from the chest position so the Beta loot/terrain RNG stream and its
 * exact `nextInt` sequence are not perturbed at all (a shared-stream draw would
 * shift every later decoration feature for that seed).
 */
const CHAINMAIL_PIECES = ['chainmail_helmet', 'chainmail_chestplate', 'chainmail_leggings', 'chainmail_boots'] as const;
/** ~1 in this many placed chests receive a single Chainmail piece. */
const CHAINMAIL_BONUS_CHANCE = 12;

export function rollChainmailBonus(x: number, y: number, z: number): { readonly slot: number; readonly stack: LootStack } | null {
  const seed = (BigInt(x) * 73856093n) ^ (BigInt(y) * 19349663n) ^ (BigInt(z) * 83492791n) ^ 0x434841494e4d41n;
  const rng = new JavaRandom(seed);
  if (rng.nextInt(CHAINMAIL_BONUS_CHANCE) !== 0) return null;
  const piece = CHAINMAIL_PIECES[rng.nextInt(CHAINMAIL_PIECES.length)]!;
  return { slot: rng.nextInt(DUNGEON_CHEST_SLOTS), stack: { id: piece, count: 1, metadata: 0 } };
}

/** Beta `pickMobSpawner`: zombie is twice as likely as skeleton or spider. */
export function pickDungeonSpawnerMob(random: JavaRandom): 'Skeleton' | 'Zombie' | 'Spider' {
  const choice = random.nextInt(4);
  if (choice === 0) return 'Skeleton';
  if (choice === 1 || choice === 2) return 'Zombie';
  return 'Spider';
}

/**
 * Fills one dungeon chest, mirroring Beta's loop: eight rolls, each placing
 * into a randomly chosen slot (later rolls may overwrite earlier ones).
 */
export function rollDungeonChest(random: JavaRandom): Map<number, LootStack> {
  const contents = new Map<number, LootStack>();
  for (let roll = 0; roll < DUNGEON_LOOT_ROLLS; roll++) {
    const stack = pickDungeonLootItem(random);
    // Beta draws the destination slot only when the roll produced an item.
    if (stack === null) continue;
    contents.set(random.nextInt(DUNGEON_CHEST_SLOTS), stack);
  }
  return contents;
}
