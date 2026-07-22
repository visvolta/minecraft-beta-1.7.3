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
  { id: 'fish_cod_raw', numericId: 349, stackSize: 64, creativeVisible: true, creativeTab: 'food', foodValue: 2, saturationValue: 0.3, useAction: 'eat' },
  { id: 'fish_cod_cooked', numericId: 350, stackSize: 64, creativeVisible: true, creativeTab: 'food', foodValue: 5, saturationValue: 0.6, useAction: 'eat' },
  { id: 'cookie', numericId: 357, stackSize: 64, creativeVisible: true, creativeTab: 'food', foodValue: 1, saturationValue: 0.1, useAction: 'eat' },
  { id: 'melon', numericId: 360, stackSize: 64, creativeVisible: true, creativeTab: 'food', foodValue: 2, saturationValue: 0.3, useAction: 'eat' },
  { id: 'beef_raw', numericId: 363, stackSize: 64, creativeVisible: true, creativeTab: 'food', foodValue: 3, saturationValue: 0.3, useAction: 'eat' },
  { id: 'beef_cooked', numericId: 364, stackSize: 64, creativeVisible: true, creativeTab: 'food', foodValue: 8, saturationValue: 0.8, useAction: 'eat' },
  { id: 'chicken_raw', numericId: 365, stackSize: 64, creativeVisible: true, creativeTab: 'food', foodValue: 2, saturationValue: 0.3, useAction: 'eat' },
  { id: 'chicken_cooked', numericId: 366, stackSize: 64, creativeVisible: true, creativeTab: 'food', foodValue: 6, saturationValue: 0.6, useAction: 'eat' },
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

const CURRENT_ITEM_IDS = [
  'arrow', 'bone', 'book_normal', 'bowl', 'bucket_empty', 'bucket_milk', 'carrot', 'coal', 'diamond',
  'door_iron', 'door_wood', 'dye_powder_blue', 'dye_powder_green', 'egg', 'feather', 'fish_cod_raw',
  'fish_cod_cooked', 'fish_salmon_raw', 'fish_salmon_cooked', 'potato', 'potato_baked', 'flint',
  'flint_and_steel', 'gold_ingot', 'gunpowder', 'iron_ingot', 'leather', 'redstone_dust', 'seeds_wheat',
  'shears', 'sign', 'stick', 'string', 'sugar', 'wheat',
  'redstone_torch', 'lever', 'stone_button', 'stone_pressure_plate', 'wood_pressure_plate', 'trapdoor',
  'minecart',
] as const;

const SPECIAL_PLACE_BLOCKS: Readonly<Record<string, number>> = {
  'redstone_dust': 55,
  'redstone_torch': 76,
  'lever': 69,
  'stone_button': 77,
  'stone_pressure_plate': 70,
  'wood_pressure_plate': 72,
  'trapdoor': 96,
};

const GENERIC_ITEMS: readonly ItemDefinition[] = CURRENT_ITEM_IDS.map((id) => {
  if (id === 'shears') return { id, stackSize: 1, durability: 238, useAction: 'none', creativeVisible: true, creativeTab: 'tools', creativeOrder: 359 };
  if (id === 'flint_and_steel') return { id, stackSize: 1, durability: 64, useAction: 'none', creativeVisible: true, creativeTab: 'tools', creativeOrder: 259 };
  if (id === 'sign') return { id, stackSize: 16, useAction: 'none', creativeVisible: true, creativeTab: 'misc', creativeOrder: 323 };
  if (id === 'minecart') return { id, numericId: 328, displayName: 'Minecart', stackSize: 1, useAction: 'none', creativeVisible: true, creativeTab: 'transportation', creativeOrder: 328 };
  if (id.startsWith('bucket_')) return { id, stackSize: 1, useAction: 'none', creativeVisible: true, creativeTab: 'misc' };
  
  const placeBlockId = (SPECIAL_PLACE_BLOCKS as any)[id];
  return { id, stackSize: 64, useAction: 'none', placeBlockId, creativeVisible: true, creativeTab: 'misc' };
});

const NUMERIC_ALIASES: Readonly<Record<number, string>> = {
  262: 'arrow', 263: 'coal', 264: 'diamond', 265: 'iron_ingot', 266: 'gold_ingot', 280: 'stick',
  281: 'bowl', 288: 'feather', 289: 'gunpowder', 295: 'seeds_wheat', 296: 'wheat', 323: 'sign',
  324: 'door_wood', 328: 'minecart', 330: 'door_iron', 331: 'redstone_dust', 334: 'leather', 344: 'egg', 352: 'bone',
  76: 'redstone_torch', 69: 'lever', 77: 'stone_button', 70: 'stone_pressure_plate', 72: 'wood_pressure_plate',
  96: 'trapdoor',
};

export class ItemDefinitionRegistry {
  private readonly byId = new Map<string, ItemDefinition>();

  public constructor(definitions: readonly ItemDefinition[] = [...GENERIC_ITEMS, ...FOODS, ...TOOLS, ...ARMOURS]) {
    for (const definition of definitions) {
      this.byId.set(definition.id, definition);
      if (definition.numericId !== undefined) this.byId.set(String(definition.numericId), definition);
    }
    for (const [numeric, id] of Object.entries(NUMERIC_ALIASES)) {
      const definition = this.byId.get(id);
      if (definition) this.byId.set(numeric, definition);
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
