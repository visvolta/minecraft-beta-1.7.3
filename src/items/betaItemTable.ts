/**
 * Canonical Minecraft Beta 1.7.3 item table.
 *
 * Transcribed from the decompiled reference (`Item.java` static initialiser;
 * ids are the constructor argument + 256). This is reference data, not a
 * registry: parity validation diffs the live registry against it so missing
 * Beta content and unsanctioned modern content both fail loudly.
 *
 * `stackSize` follows Beta's rules: 64 by default, 1 for anything damageable
 * or explicitly `setMaxStackSize(1)` (tools, armour, buckets, boats,
 * minecarts, soup, cake, bed), 16 for signs.
 */

export interface BetaItemEntry {
  readonly numericId: number;
  /** Field name in Beta's `Item.java`, kept for traceability. */
  readonly betaName: string;
  readonly stackSize: number;
  /** Beta `setMaxDamage` where the item is damageable. */
  readonly durability?: number;
  /** Beta `ItemFood` heal amount (half-hearts in Beta's hunger-free model). */
  readonly foodValue?: number;
}

export const BETA_ITEM_TABLE: readonly BetaItemEntry[] = [
  // Tools — iron
  { numericId: 256, betaName: 'shovelSteel', stackSize: 1, durability: 250 },
  { numericId: 257, betaName: 'pickaxeSteel', stackSize: 1, durability: 250 },
  { numericId: 258, betaName: 'axeSteel', stackSize: 1, durability: 250 },
  { numericId: 259, betaName: 'flintAndSteel', stackSize: 1, durability: 64 },
  { numericId: 260, betaName: 'appleRed', stackSize: 64, foodValue: 4 },
  { numericId: 261, betaName: 'bow', stackSize: 1, durability: 384 },
  { numericId: 262, betaName: 'arrow', stackSize: 64 },
  { numericId: 263, betaName: 'coal', stackSize: 64 },
  { numericId: 264, betaName: 'diamond', stackSize: 64 },
  { numericId: 265, betaName: 'ingotIron', stackSize: 64 },
  { numericId: 266, betaName: 'ingotGold', stackSize: 64 },
  { numericId: 267, betaName: 'swordSteel', stackSize: 1, durability: 250 },
  // Tools — wood
  { numericId: 268, betaName: 'swordWood', stackSize: 1, durability: 59 },
  { numericId: 269, betaName: 'shovelWood', stackSize: 1, durability: 59 },
  { numericId: 270, betaName: 'pickaxeWood', stackSize: 1, durability: 59 },
  { numericId: 271, betaName: 'axeWood', stackSize: 1, durability: 59 },
  // Tools — stone
  { numericId: 272, betaName: 'swordStone', stackSize: 1, durability: 131 },
  { numericId: 273, betaName: 'shovelStone', stackSize: 1, durability: 131 },
  { numericId: 274, betaName: 'pickaxeStone', stackSize: 1, durability: 131 },
  { numericId: 275, betaName: 'axeStone', stackSize: 1, durability: 131 },
  // Tools — diamond
  { numericId: 276, betaName: 'swordDiamond', stackSize: 1, durability: 1561 },
  { numericId: 277, betaName: 'shovelDiamond', stackSize: 1, durability: 1561 },
  { numericId: 278, betaName: 'pickaxeDiamond', stackSize: 1, durability: 1561 },
  { numericId: 279, betaName: 'axeDiamond', stackSize: 1, durability: 1561 },
  { numericId: 280, betaName: 'stick', stackSize: 64 },
  { numericId: 281, betaName: 'bowlEmpty', stackSize: 64 },
  { numericId: 282, betaName: 'bowlSoup', stackSize: 1, foodValue: 10 },
  // Tools — gold
  { numericId: 283, betaName: 'swordGold', stackSize: 1, durability: 32 },
  { numericId: 284, betaName: 'shovelGold', stackSize: 1, durability: 32 },
  { numericId: 285, betaName: 'pickaxeGold', stackSize: 1, durability: 32 },
  { numericId: 286, betaName: 'axeGold', stackSize: 1, durability: 32 },
  { numericId: 287, betaName: 'silk', stackSize: 64 },
  { numericId: 288, betaName: 'feather', stackSize: 64 },
  { numericId: 289, betaName: 'gunpowder', stackSize: 64 },
  // Hoes
  { numericId: 290, betaName: 'hoeWood', stackSize: 1, durability: 59 },
  { numericId: 291, betaName: 'hoeStone', stackSize: 1, durability: 131 },
  { numericId: 292, betaName: 'hoeSteel', stackSize: 1, durability: 250 },
  { numericId: 293, betaName: 'hoeDiamond', stackSize: 1, durability: 1561 },
  { numericId: 294, betaName: 'hoeGold', stackSize: 1, durability: 32 },
  { numericId: 295, betaName: 'seeds', stackSize: 64 },
  { numericId: 296, betaName: 'wheat', stackSize: 64 },
  { numericId: 297, betaName: 'bread', stackSize: 64, foodValue: 5 },
  // Armour — leather
  { numericId: 298, betaName: 'helmetLeather', stackSize: 1, durability: 33 },
  { numericId: 299, betaName: 'plateLeather', stackSize: 1, durability: 48 },
  { numericId: 300, betaName: 'legsLeather', stackSize: 1, durability: 45 },
  { numericId: 301, betaName: 'bootsLeather', stackSize: 1, durability: 39 },
  // Armour — chain
  { numericId: 302, betaName: 'helmetChain', stackSize: 1, durability: 66 },
  { numericId: 303, betaName: 'plateChain', stackSize: 1, durability: 96 },
  { numericId: 304, betaName: 'legsChain', stackSize: 1, durability: 90 },
  { numericId: 305, betaName: 'bootsChain', stackSize: 1, durability: 78 },
  // Armour — iron
  { numericId: 306, betaName: 'helmetSteel', stackSize: 1, durability: 132 },
  { numericId: 307, betaName: 'plateSteel', stackSize: 1, durability: 192 },
  { numericId: 308, betaName: 'legsSteel', stackSize: 1, durability: 180 },
  { numericId: 309, betaName: 'bootsSteel', stackSize: 1, durability: 156 },
  // Armour — diamond
  { numericId: 310, betaName: 'helmetDiamond', stackSize: 1, durability: 264 },
  { numericId: 311, betaName: 'plateDiamond', stackSize: 1, durability: 384 },
  { numericId: 312, betaName: 'legsDiamond', stackSize: 1, durability: 360 },
  { numericId: 313, betaName: 'bootsDiamond', stackSize: 1, durability: 312 },
  // Armour — gold
  { numericId: 314, betaName: 'helmetGold', stackSize: 1, durability: 66 },
  { numericId: 315, betaName: 'plateGold', stackSize: 1, durability: 96 },
  { numericId: 316, betaName: 'legsGold', stackSize: 1, durability: 90 },
  { numericId: 317, betaName: 'bootsGold', stackSize: 1, durability: 78 },
  { numericId: 318, betaName: 'flint', stackSize: 64 },
  { numericId: 319, betaName: 'porkRaw', stackSize: 64, foodValue: 3 },
  { numericId: 320, betaName: 'porkCooked', stackSize: 64, foodValue: 8 },
  { numericId: 321, betaName: 'painting', stackSize: 64 },
  { numericId: 322, betaName: 'appleGold', stackSize: 64, foodValue: 42 },
  { numericId: 323, betaName: 'sign', stackSize: 16 },
  { numericId: 324, betaName: 'doorWood', stackSize: 1 },
  { numericId: 325, betaName: 'bucketEmpty', stackSize: 1 },
  { numericId: 326, betaName: 'bucketWater', stackSize: 1 },
  { numericId: 327, betaName: 'bucketLava', stackSize: 1 },
  { numericId: 328, betaName: 'minecartEmpty', stackSize: 1 },
  { numericId: 329, betaName: 'saddle', stackSize: 1 },
  { numericId: 330, betaName: 'doorSteel', stackSize: 1 },
  { numericId: 331, betaName: 'redstone', stackSize: 64 },
  { numericId: 332, betaName: 'snowball', stackSize: 16 },
  { numericId: 333, betaName: 'boat', stackSize: 1 },
  { numericId: 334, betaName: 'leather', stackSize: 64 },
  { numericId: 335, betaName: 'bucketMilk', stackSize: 1 },
  { numericId: 336, betaName: 'brick', stackSize: 64 },
  { numericId: 337, betaName: 'clay', stackSize: 64 },
  { numericId: 338, betaName: 'reed', stackSize: 64 },
  { numericId: 339, betaName: 'paper', stackSize: 64 },
  { numericId: 340, betaName: 'book', stackSize: 64 },
  { numericId: 341, betaName: 'slimeBall', stackSize: 64 },
  { numericId: 342, betaName: 'minecartCrate', stackSize: 1 },
  { numericId: 343, betaName: 'minecartPowered', stackSize: 1 },
  { numericId: 344, betaName: 'egg', stackSize: 16 },
  { numericId: 345, betaName: 'compass', stackSize: 64 },
  { numericId: 346, betaName: 'fishingRod', stackSize: 1, durability: 64 },
  { numericId: 347, betaName: 'pocketSundial', stackSize: 64 },
  { numericId: 348, betaName: 'lightStoneDust', stackSize: 64 },
  { numericId: 349, betaName: 'fishRaw', stackSize: 64, foodValue: 2 },
  { numericId: 350, betaName: 'fishCooked', stackSize: 64, foodValue: 5 },
  { numericId: 351, betaName: 'dyePowder', stackSize: 64 },
  { numericId: 352, betaName: 'bone', stackSize: 64 },
  { numericId: 353, betaName: 'sugar', stackSize: 64 },
  { numericId: 354, betaName: 'cake', stackSize: 1 },
  { numericId: 355, betaName: 'bed', stackSize: 1 },
  { numericId: 356, betaName: 'redstoneRepeater', stackSize: 64 },
  { numericId: 357, betaName: 'cookie', stackSize: 64, foodValue: 1 },
  // Shears sits at 359 in Beta (constructor arg 103).
  { numericId: 359, betaName: 'shears', stackSize: 1, durability: 238 },
  // Music discs.
  { numericId: 2256, betaName: 'record13', stackSize: 1 },
  { numericId: 2257, betaName: 'recordCat', stackSize: 1 },
];

/** Beta's 16 dye metadata variants, in `ItemDye` order (metadata 0..15). */
export const BETA_DYE_VARIANTS: readonly string[] = [
  'black', 'red', 'green', 'brown', 'blue', 'purple', 'cyan', 'silver',
  'gray', 'pink', 'lime', 'yellow', 'light_blue', 'magenta', 'orange', 'white',
];

export const BETA_ITEM_IDS: ReadonlySet<number> = new Set(BETA_ITEM_TABLE.map((entry) => entry.numericId));
