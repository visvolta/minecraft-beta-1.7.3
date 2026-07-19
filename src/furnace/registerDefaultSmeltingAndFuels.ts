import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { ItemIconResolver } from '../inventory/ItemIconResolver';
import type { SmeltingRegistry } from './SmeltingRegistry';
import { SmeltingRecipe } from './SmeltingRecipe';
import type { FuelRegistry } from './FuelRegistry';
import { BlockIds } from '../blocks/BlockId';
import { ItemStack } from '../inventory/ItemStack';

function canRegister(id: string | number, blockRegistry: BlockRegistry, itemIcons: ItemIconResolver): boolean {
  if (typeof id === 'number') {
    return blockRegistry.hasId(id) || itemIcons.isKnown(String(id));
  }
  const num = Number(id);
  if (!Number.isNaN(num) && blockRegistry.hasId(num)) return true;
  return blockRegistry.hasName(id) || itemIcons.isKnown(id);
}

/**
 * Registers all standard Beta 1.7.3 smelting recipes and fuels
 * for blocks and items currently existing in the project (`Only register implemented Beta 1.7.3 content`).
 */
export function registerDefaultSmeltingAndFuels(
  smeltingRegistry: SmeltingRegistry,
  fuelRegistry: FuelRegistry,
  blockRegistry: BlockRegistry,
  itemIcons: ItemIconResolver
): void {
  const tryRegisterSmelting = (
    recipeName: string,
    inputId: string | number,
    inputMeta: number | undefined,
    output: ItemStack,
    duration = 200
  ): void => {
    if (!canRegister(inputId, blockRegistry, itemIcons)) {
      console.warn(`[SmeltingRegistry] Skipping smelting recipe "${recipeName}": missing input asset/block "${inputId}"`);
      return;
    }
    if (!canRegister(output.identity.id, blockRegistry, itemIcons)) {
      console.warn(`[SmeltingRegistry] Skipping smelting recipe "${recipeName}": missing output asset/block "${output.identity.id}"`);
      return;
    }
    smeltingRegistry.register(new SmeltingRecipe({ id: inputId, metadata: inputMeta }, output, duration));
  };

  const tryRegisterFuel = (
    fuelName: string,
    id: string | number,
    burnTime: number,
    metadata?: number | undefined
  ): void => {
    if (!canRegister(id, blockRegistry, itemIcons)) {
      console.warn(`[FuelRegistry] Skipping fuel "${fuelName}": missing asset/block "${id}"`);
      return;
    }
    fuelRegistry.register({ id, burnTime, metadata });
  };

  // --- Smelting Recipes (200 ticks = 10s at 20Hz) ---
  tryRegisterSmelting('iron_ore', BlockIds.IronOre, -1, new ItemStack('iron_ingot', 'item', 1, 0), 200);
  tryRegisterSmelting('gold_ore', BlockIds.GoldOre, -1, new ItemStack('gold_ingot', 'item', 1, 0), 200);
  tryRegisterSmelting('diamond_ore', BlockIds.DiamondOre, -1, new ItemStack('diamond', 'item', 1, 0), 200);
  tryRegisterSmelting('coal_ore', BlockIds.CoalOre, -1, new ItemStack('coal', 'item', 1, 0), 200);
  tryRegisterSmelting('sand', BlockIds.Sand, -1, new ItemStack(BlockIds.Glass, 'block', 1, 0), 200);
  tryRegisterSmelting('log_to_charcoal', BlockIds.Log, -1, new ItemStack('coal', 'item', 1, 1), 200);
  tryRegisterSmelting('spruce_log_to_charcoal', BlockIds.SpruceLog, -1, new ItemStack('coal', 'item', 1, 1), 200);
  tryRegisterSmelting('birch_log_to_charcoal', (BlockIds as any).BirchLog ?? 251, -1, new ItemStack('coal', 'item', 1, 1), 200);
  tryRegisterSmelting('cactus_green', BlockIds.Cactus, -1, new ItemStack('dye_powder_green', 'item', 1, 2), 200);
  tryRegisterSmelting('porkchop', 'porkchop_raw', -1, new ItemStack('porkchop_cooked', 'item', 1, 0), 200);
  tryRegisterSmelting('porkchop_num', 319, -1, new ItemStack('porkchop_cooked', 'item', 1, 0), 200);
  tryRegisterSmelting('fish_cod', 'fish_cod_raw', -1, new ItemStack('fish_cod_cooked', 'item', 1, 0), 200);
  tryRegisterSmelting('fish_salmon', 'fish_salmon_raw', -1, new ItemStack('fish_salmon_cooked', 'item', 1, 0), 200);
  tryRegisterSmelting('potato', 'potato', -1, new ItemStack('potato_baked', 'item', 1, 0), 200);

  // --- Fuels ---
  // Coal and Charcoal (1600 ticks = 80s = 8 items)
  tryRegisterFuel('coal', 'coal', 1600, -1);
  tryRegisterFuel('coal_num', 263, 1600, -1);

  // Wooden blocks (300 ticks = 15s = 1.5 items)
  tryRegisterFuel('planks', BlockIds.Planks, 300, -1);
  tryRegisterFuel('wood_stairs', BlockIds.WoodStairs, 300, -1);
  tryRegisterFuel('wood_slab', BlockIds.WoodSlab, 300, -1);
  tryRegisterFuel('fence', BlockIds.Fence, 300, -1);
  tryRegisterFuel('bookshelf', BlockIds.Bookshelf, 300, -1);
  tryRegisterFuel('chest', BlockIds.Chest, 300, -1);
  tryRegisterFuel('crafting_table', BlockIds.CraftingTable, 300, -1);
  tryRegisterFuel('log', BlockIds.Log, 300, -1);
  tryRegisterFuel('spruce_log', BlockIds.SpruceLog, 300, -1);
  tryRegisterFuel('birch_log', (BlockIds as any).BirchLog ?? 251, 300, -1);

  // Sticks and saplings (100 ticks = 5s = 0.5 items)
  tryRegisterFuel('stick', 'stick', 100, -1);
  tryRegisterFuel('stick_num', 280, 100, -1);
  tryRegisterFuel('sapling', BlockIds.Sapling, 100, -1);

  // Wooden tools/weapons (200 ticks = 10s = 1 item)
  tryRegisterFuel('wood_pickaxe', 'wood_pickaxe', 200, -1);
  tryRegisterFuel('wood_pickaxe_num', 270, 200, -1);
  tryRegisterFuel('wood_axe', 'wood_axe', 200, -1);
  tryRegisterFuel('wood_axe_num', 271, 200, -1);
  tryRegisterFuel('wood_shovel', 'wood_shovel', 200, -1);
  tryRegisterFuel('wood_shovel_num', 269, 200, -1);
  tryRegisterFuel('wood_sword', 'wood_sword', 200, -1);
  tryRegisterFuel('wood_sword_num', 268, 200, -1);
  tryRegisterFuel('wood_hoe', 'wood_hoe', 200, -1);
  tryRegisterFuel('wood_hoe_num', 290, 200, -1);

  // Lava bucket (20000 ticks = 1000s = 100 items -> leaves bucket_empty)
  tryRegisterFuel('bucket_lava', 'bucket_lava', 20000, -1);
  tryRegisterFuel('bucket_lava_num', 327, 20000, -1);
}
