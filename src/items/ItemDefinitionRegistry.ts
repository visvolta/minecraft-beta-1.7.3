import {
  ARMOUR_ITEM_IDS,
  ARMOUR_MATERIALS,
  ARMOUR_SLOTS,
  ARMOUR_SLOT_PROTECTION,
  type ArmourMaterialId,
} from './ArmourMaterial';
import type { ItemDefinition, ToolClass } from './ItemDefinition';
import { TOOL_MATERIALS, type ToolMaterialId } from './ToolMaterial';

const FOODS: readonly ItemDefinition[] = [
  { id: 'apple', numericId: 260, stackSize: 64, creativeVisible: true, creativeTab: 'food', foodValue: 4, saturationValue: 0.3, useAction: 'eat' },
  { id: 'bread', numericId: 297, stackSize: 64, creativeVisible: true, creativeTab: 'food', foodValue: 5, saturationValue: 0.6, useAction: 'eat' },
  { id: 'mushroom_stew', numericId: 282, stackSize: 1, creativeVisible: true, creativeTab: 'food', foodValue: 10, saturationValue: 0.6, useAction: 'eat', containerItem: 'bowl' },
  { id: 'porkchop_raw', numericId: 319, stackSize: 64, creativeVisible: true, creativeTab: 'food', foodValue: 3, saturationValue: 0.3, useAction: 'eat' },
  { id: 'porkchop_cooked', numericId: 320, stackSize: 64, creativeVisible: true, creativeTab: 'food', foodValue: 8, saturationValue: 0.8, useAction: 'eat' },
  { id: 'apple_golden', numericId: 322, stackSize: 64, creativeVisible: true, creativeTab: 'food', foodValue: 42, saturationValue: 1, useAction: 'eat' },
  { id: 'fish_cod_raw', numericId: 349, stackSize: 64, creativeVisible: true, creativeTab: 'food', foodValue: 2, saturationValue: 0.3, useAction: 'eat' },
  { id: 'fish_cod_cooked', numericId: 350, stackSize: 64, creativeVisible: true, creativeTab: 'food', foodValue: 5, saturationValue: 0.6, useAction: 'eat' },
  { id: 'cookie', numericId: 357, stackSize: 64, creativeVisible: true, creativeTab: 'food', foodValue: 1, saturationValue: 0.1, useAction: 'eat' },
  // Sanctioned deviations — see src/items/BetaDeviations.ts.
  { id: 'beef_raw', numericId: 363, stackSize: 64, creativeVisible: true, creativeTab: 'food', foodValue: 3, saturationValue: 0.3, useAction: 'eat' },
  { id: 'beef_cooked', numericId: 364, stackSize: 64, creativeVisible: true, creativeTab: 'food', foodValue: 8, saturationValue: 0.8, useAction: 'eat' },
  { id: 'chicken_raw', numericId: 365, stackSize: 64, creativeVisible: true, creativeTab: 'food', foodValue: 2, saturationValue: 0.3, useAction: 'eat' },
  { id: 'chicken_cooked', numericId: 366, stackSize: 64, creativeVisible: true, creativeTab: 'food', foodValue: 6, saturationValue: 0.6, useAction: 'eat' },
  { id: 'mutton_raw', numericId: 367, stackSize: 64, creativeVisible: true, creativeTab: 'food', foodValue: 2, saturationValue: 0.3, useAction: 'eat' },
  { id: 'mutton_cooked', numericId: 368, stackSize: 64, creativeVisible: true, creativeTab: 'food', foodValue: 6, saturationValue: 0.6, useAction: 'eat' },
];

const TOOL_IDS: Readonly<Record<ToolMaterialId, Readonly<Record<ToolClass, number>>>> = {
  wood: { hand: 0, pickaxe: 270, axe: 271, shovel: 269, sword: 268, hoe: 290 },
  stone: { hand: 0, pickaxe: 274, axe: 275, shovel: 273, sword: 272, hoe: 291 },
  iron: { hand: 0, pickaxe: 257, axe: 258, shovel: 256, sword: 267, hoe: 292 },
  diamond: { hand: 0, pickaxe: 278, axe: 279, shovel: 277, sword: 276, hoe: 293 },
  gold: { hand: 0, pickaxe: 285, axe: 286, shovel: 284, sword: 283, hoe: 294 },
};

const TOOL_CLASSES: readonly Exclude<ToolClass, 'hand'>[] = ['pickaxe', 'axe', 'shovel', 'sword', 'hoe'];
const TOOLS: ItemDefinition[] = [];
for (const materialId of Object.keys(TOOL_MATERIALS) as ToolMaterialId[]) {
  const material = TOOL_MATERIALS[materialId];
  for (const toolClass of TOOL_CLASSES) {
    TOOLS.push({
      id: `${materialId}_${toolClass}`,
      numericId: TOOL_IDS[materialId][toolClass],
      stackSize: 1,
      creativeVisible: true,
      creativeTab: 'tools',
      creativeOrder: TOOL_IDS[materialId][toolClass],
      durability: material.durability,
      useAction: 'none',
      toolClass,
      toolMaterial: materialId,
      miningSpeed: material.miningSpeed,
      harvestLevel: material.harvestLevel,
      combatBonus: material.combatBonus,
    });
  }
}

const ARMOURS: ItemDefinition[] = [];
for (const materialId of Object.keys(ARMOUR_MATERIALS) as ArmourMaterialId[]) {
  const material = ARMOUR_MATERIALS[materialId];
  const textureMaterial = materialId === 'chain' ? 'chainmail' : materialId;
  for (const armourSlot of ARMOUR_SLOTS) {
    ARMOURS.push({
      id: `${textureMaterial}_${armourSlot}`,
      numericId: ARMOUR_ITEM_IDS[materialId][armourSlot],
      stackSize: 1,
      creativeVisible: true,
      creativeTab: 'combat',
      creativeOrder: ARMOUR_ITEM_IDS[materialId][armourSlot],
      durability: material.durability[armourSlot],
      useAction: 'none',
      armourSlot,
      armourMaterial: materialId,
      protection: ARMOUR_SLOT_PROTECTION[armourSlot],
    });
  }
}

/**
 * Every non-food, non-tool, non-armour Beta 1.7.3 item, each with its real
 * numeric id. Items are addressable both by string id and numeric id, so
 * numeric-keyed systems (saves, drops, recipes) resolve the same definition
 * as the string-keyed UI paths.
 *
 * Some entries are registry/icon/recipe complete while their deeper gameplay
 * behaviour is not implemented; those are listed in UNIMPLEMENTED_BEHAVIOUR
 * so the gap is explicit rather than implied by absence.
 */
const GENERIC_ITEMS: readonly ItemDefinition[] = [
  // Materials
  { id: 'coal', numericId: 263, stackSize: 64, useAction: 'none', creativeVisible: true, creativeTab: 'misc', creativeOrder: 263 },
  { id: 'diamond', numericId: 264, stackSize: 64, useAction: 'none', creativeVisible: true, creativeTab: 'misc', creativeOrder: 264 },
  { id: 'iron_ingot', numericId: 265, stackSize: 64, useAction: 'none', creativeVisible: true, creativeTab: 'misc', creativeOrder: 265 },
  { id: 'gold_ingot', numericId: 266, stackSize: 64, useAction: 'none', creativeVisible: true, creativeTab: 'misc', creativeOrder: 266 },
  { id: 'stick', numericId: 280, stackSize: 64, useAction: 'none', creativeVisible: true, creativeTab: 'misc', creativeOrder: 280 },
  { id: 'bowl', numericId: 281, stackSize: 64, useAction: 'none', creativeVisible: true, creativeTab: 'misc', creativeOrder: 281 },
  { id: 'string', numericId: 287, stackSize: 64, useAction: 'none', creativeVisible: true, creativeTab: 'misc', creativeOrder: 287 },
  { id: 'feather', numericId: 288, stackSize: 64, useAction: 'none', creativeVisible: true, creativeTab: 'misc', creativeOrder: 288 },
  { id: 'gunpowder', numericId: 289, stackSize: 64, useAction: 'none', creativeVisible: true, creativeTab: 'misc', creativeOrder: 289 },
  { id: 'seeds_wheat', numericId: 295, stackSize: 64, useAction: 'none', creativeVisible: true, creativeTab: 'misc', creativeOrder: 295 },
  { id: 'wheat', numericId: 296, stackSize: 64, useAction: 'none', creativeVisible: true, creativeTab: 'misc', creativeOrder: 296 },
  { id: 'flint', numericId: 318, stackSize: 64, useAction: 'none', creativeVisible: true, creativeTab: 'misc', creativeOrder: 318 },
  { id: 'leather', numericId: 334, stackSize: 64, useAction: 'none', creativeVisible: true, creativeTab: 'misc', creativeOrder: 334 },
  { id: 'brick', numericId: 336, stackSize: 64, useAction: 'none', creativeVisible: true, creativeTab: 'misc', creativeOrder: 336 },
  { id: 'clay_ball', numericId: 337, stackSize: 64, useAction: 'none', creativeVisible: true, creativeTab: 'misc', creativeOrder: 337 },
  { id: 'paper', numericId: 339, stackSize: 64, useAction: 'none', creativeVisible: true, creativeTab: 'misc', creativeOrder: 339 },
  { id: 'book_normal', numericId: 340, stackSize: 64, useAction: 'none', creativeVisible: true, creativeTab: 'misc', creativeOrder: 340 },
  { id: 'slimeball', numericId: 341, stackSize: 64, useAction: 'none', creativeVisible: true, creativeTab: 'misc', creativeOrder: 341 },
  { id: 'bone', numericId: 352, stackSize: 64, useAction: 'none', creativeVisible: true, creativeTab: 'misc', creativeOrder: 352 },
  { id: 'sugar', numericId: 353, stackSize: 64, useAction: 'none', creativeVisible: true, creativeTab: 'misc', creativeOrder: 353 },
  { id: 'glowstone_dust', numericId: 348, stackSize: 64, useAction: 'none', creativeVisible: true, creativeTab: 'misc', creativeOrder: 348 },
  { id: 'redstone_dust', numericId: 331, stackSize: 64, useAction: 'none', placeBlockId: 55, creativeVisible: true, creativeTab: 'redstone', creativeOrder: 331 },
  { id: 'reeds', numericId: 338, stackSize: 64, useAction: 'none', placeBlockId: 83, creativeVisible: true, creativeTab: 'misc', creativeOrder: 338 },

  // Utility / tools
  { id: 'flint_and_steel', numericId: 259, stackSize: 1, durability: 64, useAction: 'none', creativeVisible: true, creativeTab: 'tools', creativeOrder: 259 },
  { id: 'bow', numericId: 261, stackSize: 1, durability: 384, useAction: 'none', creativeVisible: true, creativeTab: 'combat', creativeOrder: 261 },
  { id: 'arrow', numericId: 262, stackSize: 64, useAction: 'none', creativeVisible: true, creativeTab: 'combat', creativeOrder: 262 },
  { id: 'shears', numericId: 359, stackSize: 1, durability: 238, useAction: 'none', creativeVisible: true, creativeTab: 'tools', creativeOrder: 359 },
  { id: 'fishing_rod', numericId: 346, stackSize: 1, durability: 64, useAction: 'none', creativeVisible: true, creativeTab: 'tools', creativeOrder: 346 },
  { id: 'compass', numericId: 345, stackSize: 64, useAction: 'none', creativeVisible: true, creativeTab: 'tools', creativeOrder: 345 },
  { id: 'clock', numericId: 347, stackSize: 64, useAction: 'none', creativeVisible: true, creativeTab: 'tools', creativeOrder: 347 },
  { id: 'bucket_empty', numericId: 325, stackSize: 1, useAction: 'none', creativeVisible: true, creativeTab: 'misc', creativeOrder: 325 },
  { id: 'bucket_water', numericId: 326, stackSize: 1, useAction: 'none', creativeVisible: true, creativeTab: 'misc', creativeOrder: 326 },
  { id: 'bucket_lava', numericId: 327, stackSize: 1, useAction: 'none', creativeVisible: true, creativeTab: 'misc', creativeOrder: 327 },
  { id: 'bucket_milk', numericId: 335, stackSize: 1, useAction: 'none', creativeVisible: true, creativeTab: 'misc', creativeOrder: 335 },
  { id: 'egg', numericId: 344, stackSize: 16, useAction: 'none', creativeVisible: true, creativeTab: 'misc', creativeOrder: 344 },
  { id: 'snowball', numericId: 332, stackSize: 16, useAction: 'none', creativeVisible: true, creativeTab: 'misc', creativeOrder: 332 },
  { id: 'saddle', numericId: 329, stackSize: 1, useAction: 'none', creativeVisible: true, creativeTab: 'transportation', creativeOrder: 329 },
  { id: 'painting', numericId: 321, stackSize: 64, useAction: 'none', creativeVisible: true, creativeTab: 'decoration', creativeOrder: 321 },

  // Placeable items
  { id: 'sign', numericId: 323, stackSize: 16, useAction: 'none', placeBlockId: 63, creativeVisible: true, creativeTab: 'decoration', creativeOrder: 323 },
  { id: 'door_wood', numericId: 324, stackSize: 1, useAction: 'none', placeBlockId: 64, creativeVisible: true, creativeTab: 'decoration', creativeOrder: 324 },
  { id: 'door_iron', numericId: 330, stackSize: 1, useAction: 'none', placeBlockId: 71, creativeVisible: true, creativeTab: 'decoration', creativeOrder: 330 },
  { id: 'bed', numericId: 355, stackSize: 1, useAction: 'none', placeBlockId: 26, creativeVisible: true, creativeTab: 'decoration', creativeOrder: 355 },
  { id: 'cake', numericId: 354, stackSize: 1, useAction: 'none', placeBlockId: 92, creativeVisible: true, creativeTab: 'food', creativeOrder: 354 },
  { id: 'redstone_repeater', numericId: 356, stackSize: 64, useAction: 'none', placeBlockId: 93, creativeVisible: true, creativeTab: 'redstone', creativeOrder: 356 },
  { id: 'redstone_torch', numericId: 76, stackSize: 64, useAction: 'none', placeBlockId: 76, creativeVisible: true, creativeTab: 'redstone' },
  { id: 'lever', numericId: 69, stackSize: 64, useAction: 'none', placeBlockId: 69, creativeVisible: true, creativeTab: 'redstone' },
  { id: 'stone_button', numericId: 77, stackSize: 64, useAction: 'none', placeBlockId: 77, creativeVisible: true, creativeTab: 'redstone' },
  { id: 'stone_pressure_plate', numericId: 70, stackSize: 64, useAction: 'none', placeBlockId: 70, creativeVisible: true, creativeTab: 'redstone' },
  { id: 'wood_pressure_plate', numericId: 72, stackSize: 64, useAction: 'none', placeBlockId: 72, creativeVisible: true, creativeTab: 'redstone' },
  { id: 'trapdoor', numericId: 96, stackSize: 64, useAction: 'none', placeBlockId: 96, creativeVisible: true, creativeTab: 'redstone' },

  // Transportation
  { id: 'minecart', numericId: 328, displayName: 'Minecart', stackSize: 1, useAction: 'none', creativeVisible: true, creativeTab: 'transportation', creativeOrder: 328 },
  { id: 'minecart_chest', numericId: 342, displayName: 'Minecart with Chest', stackSize: 1, useAction: 'none', creativeVisible: true, creativeTab: 'transportation', creativeOrder: 342 },
  { id: 'minecart_furnace', numericId: 343, displayName: 'Minecart with Furnace', stackSize: 1, useAction: 'none', creativeVisible: true, creativeTab: 'transportation', creativeOrder: 343 },
  { id: 'boat', numericId: 333, stackSize: 1, useAction: 'none', creativeVisible: true, creativeTab: 'transportation', creativeOrder: 333 },

  // Music discs
  { id: 'record_13', numericId: 2256, displayName: 'Music Disc 13', stackSize: 1, useAction: 'none', creativeVisible: true, creativeTab: 'misc', creativeOrder: 2256 },
  { id: 'record_cat', numericId: 2257, displayName: 'Music Disc cat', stackSize: 1, useAction: 'none', creativeVisible: true, creativeTab: 'misc', creativeOrder: 2257 },
];

/**
 * Beta's 16 dye variants share item id 351 and are distinguished by metadata.
 * Registered individually here (with the shared numeric id carried only by
 * metadata 0) because this project keys items by string id.
 */
const DYE_VARIANTS: readonly { readonly suffix: string; readonly metadata: number }[] = [
  { suffix: 'black', metadata: 0 }, { suffix: 'red', metadata: 1 },
  { suffix: 'green', metadata: 2 }, { suffix: 'brown', metadata: 3 },
  { suffix: 'blue', metadata: 4 }, { suffix: 'purple', metadata: 5 },
  { suffix: 'cyan', metadata: 6 }, { suffix: 'silver', metadata: 7 },
  { suffix: 'gray', metadata: 8 }, { suffix: 'pink', metadata: 9 },
  { suffix: 'lime', metadata: 10 }, { suffix: 'yellow', metadata: 11 },
  { suffix: 'light_blue', metadata: 12 }, { suffix: 'magenta', metadata: 13 },
  { suffix: 'orange', metadata: 14 }, { suffix: 'white', metadata: 15 },
];

const DYES: readonly ItemDefinition[] = DYE_VARIANTS.map(({ suffix, metadata }) => ({
  id: `dye_powder_${suffix}`,
  // Only metadata 0 claims the shared numeric id; the rest are string-addressed.
  ...(metadata === 0 ? { numericId: 351 } : {}),
  stackSize: 64,
  useAction: 'none' as const,
  creativeVisible: true,
  creativeTab: 'misc',
  creativeOrder: 351,
}));

/**
 * Items that are registry/icon/recipe complete but whose full Beta gameplay
 * behaviour is deliberately not implemented in this stage. Recorded here so
 * completeness reporting can distinguish "absent" from "present but inert".
 */
export const UNIMPLEMENTED_BEHAVIOUR: Readonly<Record<string, string>> = {
  // Beds sleep and skip to dawn; Beta additionally sets the player's spawn
  // point on wake, which this project does not yet do.
  bed: 'Sleeping works; setting the respawn point on wake is not implemented.',
  cake: 'Progressive eating slices not implemented.',
  redstone_repeater: 'Delay/lock repeater logic not implemented.',
  saddle: 'Pig riding not implemented.',
  minecart_chest: 'Chest-cart inventory not implemented.',
  minecart_furnace: 'Furnace-cart propulsion not implemented.',
  record_13: 'Jukebox playback not implemented.',
  record_cat: 'Jukebox playback not implemented.',
  slimeball: 'Slimes do not spawn; obtainable only via creative.',
  snowball: 'Throwable snowball projectile not implemented.',
  egg: 'Throwable egg projectile not implemented.',
};

function humanizeItemId(id: string): string {
  return id.split('_').map((part) => part.length === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

/**
 * Legacy string spellings kept resolvable so older saves and existing call
 * sites continue to work. Numeric ids no longer need aliasing: every
 * definition above carries its real Beta `numericId` and is indexed by it.
 */
const LEGACY_STRING_ALIASES: Readonly<Record<string, string>> = {
  wood_door: 'door_wood',
  iron_door: 'door_iron',
  reed: 'reeds',
  seeds: 'seeds_wheat',
  clay: 'clay_ball',
  string_item: 'string',
  slime_ball: 'slimeball',
};

export class ItemDefinitionRegistry {
  private readonly byId = new Map<string, ItemDefinition>();

  public constructor(definitions: readonly ItemDefinition[] = [...GENERIC_ITEMS, ...DYES, ...FOODS, ...TOOLS, ...ARMOURS]) {
    const numericOwners = new Map<number, string>();
    for (const definition of definitions) {
      const normalized: ItemDefinition = { ...definition, displayName: definition.displayName ?? humanizeItemId(definition.id), iconKey: definition.iconKey ?? definition.id };
      if (this.byId.has(normalized.id)) throw new Error(`Duplicate item id registered: ${normalized.id}`);
      this.byId.set(normalized.id, normalized);
      if (normalized.numericId !== undefined) {
        const existingOwner = numericOwners.get(normalized.numericId);
        if (existingOwner !== undefined && existingOwner !== normalized.id) throw new Error(`Duplicate numeric item id ${normalized.numericId}: ${existingOwner} and ${normalized.id}`);
        numericOwners.set(normalized.numericId, normalized.id);
        this.byId.set(String(normalized.numericId), normalized);
      }
    }
    for (const [alias, id] of Object.entries(LEGACY_STRING_ALIASES)) {
      const definition = this.byId.get(id);
      if (definition === undefined) continue;
      const existing = this.byId.get(alias);
      if (existing !== undefined && existing.id !== definition.id) {
        throw new Error(`Conflicting item alias ${alias}: ${existing.id} and ${definition.id}`);
      }
      this.byId.set(alias, definition);
    }
  }

  public get(id: string | number): ItemDefinition | undefined {
    return this.byId.get(String(id));
  }

  public isFood(id: string | number): boolean {
    return this.get(id)?.useAction === 'eat';
  }

  public values(): ItemDefinition[] {
    return [...new Set(this.byId.values())];
  }
}

export const DEFAULT_ITEM_DEFINITIONS = new ItemDefinitionRegistry();
