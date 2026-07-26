import type { RecipeRegistry } from './RecipeRegistry';
import { ShapedRecipe } from './ShapedRecipe';
import { ShapelessRecipe } from './ShapelessRecipe';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { ItemIconResolver } from '../inventory/ItemIconResolver';
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
 * Registers all standard Beta 1.7.3 shaped and shapeless crafting recipes
 * for blocks and items registered in BlockRegistry and ItemIconResolver.
 */
/**
 * Recipes skipped during the last registerDefaultRecipes call because an
 * ingredient or output was not registered. Exposed so validation can fail on
 * missing content instead of it disappearing into a console warning.
 */
export const skippedRecipes: string[] = [];

export function registerDefaultRecipes(
  registry: RecipeRegistry,
  blockRegistry: BlockRegistry,
  itemIcons: ItemIconResolver
): void {
  skippedRecipes.length = 0;
  const tryRegisterShaped = (
    recipeName: string,
    width: number,
    height: number,
    pattern: readonly ({ id: string | number; metadata?: number | undefined } | null)[],
    output: ItemStack,
    mirrored = true
  ): void => {
    // Verify all ingredients and output exist
    if (!canRegister(output.identity.id, blockRegistry, itemIcons)) {
      skippedRecipes.push(`${recipeName}: missing output "${String(output.identity.id)}"`);
      return;
    }
    for (const ing of pattern) {
      if (ing !== null && !canRegister(ing.id, blockRegistry, itemIcons)) {
        skippedRecipes.push(`${recipeName}: missing ingredient "${String(ing.id)}"`);
        return;
      }
    }
    registry.register(new ShapedRecipe(width, height, pattern, output, mirrored));
  };

  const tryRegisterShapeless = (
    recipeName: string,
    ingredients: readonly { id: string | number; metadata?: number | undefined }[],
    output: ItemStack
  ): void => {
    if (!canRegister(output.identity.id, blockRegistry, itemIcons)) {
      skippedRecipes.push(`${recipeName}: missing output "${String(output.identity.id)}"`);
      return;
    }
    for (const ing of ingredients) {
      if (!canRegister(ing.id, blockRegistry, itemIcons)) {
        skippedRecipes.push(`${recipeName}: missing ingredient "${String(ing.id)}"`);
        return;
      }
    }
    registry.register(new ShapelessRecipe(ingredients, output));
  };

  // 1x1 / 2x1 Basic building & conversion
  tryRegisterShaped('oak_planks', 1, 1, [{ id: BlockIds.Log, metadata: -1 }], new ItemStack(BlockIds.Planks, 'block', 4, 0), false);
  tryRegisterShaped('spruce_planks', 1, 1, [{ id: BlockIds.SpruceLog, metadata: -1 }], new ItemStack(BlockIds.Planks, 'block', 4, 0), false);
  tryRegisterShaped('birch_planks', 1, 1, [{ id: (BlockIds as any).BirchLog ?? 251, metadata: -1 }], new ItemStack(BlockIds.Planks, 'block', 4, 0), false);
  tryRegisterShaped('sugar', 1, 1, [{ id: BlockIds.Reed, metadata: -1 }], new ItemStack('sugar', 'item', 1, 0), false);

  // 2x2 Recipes (Matchable in both 2x2 player inventory grid and 3x3 crafting table grid)
  tryRegisterShaped('sticks', 1, 2, [{ id: BlockIds.Planks, metadata: -1 }, { id: BlockIds.Planks, metadata: -1 }], new ItemStack('stick', 'item', 4, 0), false);
  tryRegisterShaped('torch_coal', 1, 2, [{ id: 'coal', metadata: -1 }, { id: 'stick' }], new ItemStack(BlockIds.Torch, 'block', 4, 0), false);
  tryRegisterShaped('torch_coal_num', 1, 2, [{ id: 263, metadata: -1 }, { id: 280 }], new ItemStack(BlockIds.Torch, 'block', 4, 0), false);
  tryRegisterShaped('crafting_table', 2, 2, [
    { id: BlockIds.Planks, metadata: -1 }, { id: BlockIds.Planks, metadata: -1 },
    { id: BlockIds.Planks, metadata: -1 }, { id: BlockIds.Planks, metadata: -1 }
  ], new ItemStack(BlockIds.CraftingTable, 'block', 1, 0), false);
  tryRegisterShapeless('flint_and_steel', [{ id: 'iron_ingot' }, { id: 'flint' }], new ItemStack('flint_and_steel', 'item', 1, 0));
  tryRegisterShapeless('flint_and_steel_num', [{ id: 265 }, { id: 318 }], new ItemStack('flint_and_steel', 'item', 1, 0));
  tryRegisterShaped('shears', 2, 2, [{ id: 'iron_ingot' }, null, null, { id: 'iron_ingot' }], new ItemStack('shears', 'item', 1, 0), true);

  // 3x3 Recipes (Crafting table only)
  tryRegisterShaped('chest', 3, 3, [
    { id: BlockIds.Planks, metadata: -1 }, { id: BlockIds.Planks, metadata: -1 }, { id: BlockIds.Planks, metadata: -1 },
    { id: BlockIds.Planks, metadata: -1 }, null,                                  { id: BlockIds.Planks, metadata: -1 },
    { id: BlockIds.Planks, metadata: -1 }, { id: BlockIds.Planks, metadata: -1 }, { id: BlockIds.Planks, metadata: -1 }
  ], new ItemStack(BlockIds.Chest, 'block', 1, 0), false);

  tryRegisterShaped('bookshelf', 3, 3, [
    { id: BlockIds.Planks, metadata: -1 }, { id: BlockIds.Planks, metadata: -1 }, { id: BlockIds.Planks, metadata: -1 },
    { id: 'book_normal' },                  { id: 'book_normal' },                  { id: 'book_normal' },
    { id: BlockIds.Planks, metadata: -1 }, { id: BlockIds.Planks, metadata: -1 }, { id: BlockIds.Planks, metadata: -1 }
  ], new ItemStack(BlockIds.Bookshelf, 'block', 1, 0), false);

  tryRegisterShaped('tnt', 3, 3, [
    { id: 'gunpowder' },    { id: BlockIds.Sand }, { id: 'gunpowder' },
    { id: BlockIds.Sand }, { id: 'gunpowder' },    { id: BlockIds.Sand },
    { id: 'gunpowder' },    { id: BlockIds.Sand }, { id: 'gunpowder' }
  ], new ItemStack(BlockIds.TNT, 'block', 1, 0), false);

  tryRegisterShaped('ladder', 3, 3, [
    { id: 'stick' }, null, { id: 'stick' },
    { id: 'stick' }, { id: 'stick' }, { id: 'stick' },
    { id: 'stick' }, null, { id: 'stick' }
  ], new ItemStack(BlockIds.Ladder, 'block', 3, 0), false);

  tryRegisterShaped('wood_stairs', 3, 3, [
    { id: BlockIds.Planks, metadata: -1 }, null, null,
    { id: BlockIds.Planks, metadata: -1 }, { id: BlockIds.Planks, metadata: -1 }, null,
    { id: BlockIds.Planks, metadata: -1 }, { id: BlockIds.Planks, metadata: -1 }, { id: BlockIds.Planks, metadata: -1 }
  ], new ItemStack(BlockIds.WoodStairs, 'block', 4, 0), true);

  tryRegisterShaped('wood_slab', 3, 1, [
    { id: BlockIds.Planks, metadata: -1 }, { id: BlockIds.Planks, metadata: -1 }, { id: BlockIds.Planks, metadata: -1 }
  ], new ItemStack(BlockIds.Slab, 'block', 3, 2), false);

  tryRegisterShaped('stone_slab', 3, 1, [
    { id: BlockIds.Stone, metadata: -1 }, { id: BlockIds.Stone, metadata: -1 }, { id: BlockIds.Stone, metadata: -1 }
  ], new ItemStack(BlockIds.Slab, 'block', 3, 0), false);

  tryRegisterShaped('cobblestone_slab', 3, 1, [
    { id: BlockIds.Cobblestone, metadata: -1 }, { id: BlockIds.Cobblestone, metadata: -1 }, { id: BlockIds.Cobblestone, metadata: -1 }
  ], new ItemStack(BlockIds.Slab, 'block', 3, 3), false);

  tryRegisterShaped('wood_door', 2, 3, [
    { id: BlockIds.Planks, metadata: -1 }, { id: BlockIds.Planks, metadata: -1 },
    { id: BlockIds.Planks, metadata: -1 }, { id: BlockIds.Planks, metadata: -1 },
    { id: BlockIds.Planks, metadata: -1 }, { id: BlockIds.Planks, metadata: -1 }
  ], new ItemStack('door_wood', 'item', 1, 0), false);

  tryRegisterShaped('iron_door', 2, 3, [
    { id: 'iron_ingot' }, { id: 'iron_ingot' },
    { id: 'iron_ingot' }, { id: 'iron_ingot' },
    { id: 'iron_ingot' }, { id: 'iron_ingot' }
  ], new ItemStack('door_iron', 'item', 1, 0), false);

  tryRegisterShaped('minecart', 3, 2, [
    { id: 'iron_ingot' }, null, { id: 'iron_ingot' },
    { id: 'iron_ingot' }, { id: 'iron_ingot' }, { id: 'iron_ingot' }
  ], new ItemStack(328, 'item', 1, 0), false);

  tryRegisterShaped('trapdoor', 3, 2, [
    { id: BlockIds.Planks, metadata: -1 }, { id: BlockIds.Planks, metadata: -1 }, { id: BlockIds.Planks, metadata: -1 },
    { id: BlockIds.Planks, metadata: -1 }, { id: BlockIds.Planks, metadata: -1 }, { id: BlockIds.Planks, metadata: -1 }
  ], new ItemStack(BlockIds.Trapdoor, 'block', 2, 0), false);

  tryRegisterShaped('ladder', 3, 3, [
    { id: 'stick' }, null, { id: 'stick' },
    { id: 'stick' }, { id: 'stick' }, { id: 'stick' },
    { id: 'stick' }, null, { id: 'stick' }
  ], new ItemStack(BlockIds.Ladder, 'block', 2, 0), false);

  tryRegisterShaped('sign', 3, 3, [
    { id: BlockIds.Planks, metadata: -1 }, { id: BlockIds.Planks, metadata: -1 }, { id: BlockIds.Planks, metadata: -1 },
    { id: BlockIds.Planks, metadata: -1 }, { id: BlockIds.Planks, metadata: -1 }, { id: BlockIds.Planks, metadata: -1 },
    null, { id: 'stick' }, null
  ], new ItemStack('sign', 'item', 1, 0), false);

  tryRegisterShaped('stone_pressure_plate', 2, 1, [
    { id: BlockIds.Stone, metadata: -1 }, { id: BlockIds.Stone, metadata: -1 }
  ], new ItemStack(BlockIds.StonePressurePlate, 'block', 1, 0), false);

  tryRegisterShaped('wood_pressure_plate', 2, 1, [
    { id: BlockIds.Planks, metadata: -1 }, { id: BlockIds.Planks, metadata: -1 }
  ], new ItemStack(BlockIds.WoodPressurePlate, 'block', 1, 0), false);

  tryRegisterShaped('stone_button', 1, 1, [
    { id: BlockIds.Cobblestone, metadata: -1 }
  ], new ItemStack(BlockIds.StoneButton, 'block', 1, 0), false);

  tryRegisterShaped('lever', 1, 2, [
    { id: 'stick' },
    { id: BlockIds.Cobblestone, metadata: -1 }
  ], new ItemStack(BlockIds.Lever, 'block', 1, 0), false);

  tryRegisterShaped('bread', 3, 1, [
    { id: 'wheat' }, { id: 'wheat' }, { id: 'wheat' }
  ], new ItemStack('bread', 'item', 1, 0), false);

  tryRegisterShaped('bowl', 3, 2, [
    { id: BlockIds.Planks, metadata: -1 }, null, { id: BlockIds.Planks, metadata: -1 },
    null,                                  { id: BlockIds.Planks, metadata: -1 }, null
  ], new ItemStack('bowl', 'item', 4, 0), false);

  tryRegisterShapeless('mushroom_stew', [
    { id: 'bowl' }, { id: BlockIds.BrownMushroom }, { id: BlockIds.RedMushroom }
  ], new ItemStack('mushroom_stew', 'item', 1, 0));

  // Beta armour recipes. Chain definitions exist, but the fire-block recipes are intentionally omitted.
  const armourMaterials: ReadonlyArray<readonly [string, string]> = [
    ['leather', 'leather'],
    ['iron_ingot', 'iron'],
    ['diamond', 'diamond'],
    ['gold_ingot', 'gold'],
  ];
  for (const [ingredientId, material] of armourMaterials) {
    const ingredient = { id: ingredientId };
    tryRegisterShaped(`${material}_helmet`, 3, 2, [
      ingredient, ingredient, ingredient,
      ingredient, null, ingredient,
    ], new ItemStack(`${material}_helmet`, 'item', 1), false);
    tryRegisterShaped(`${material}_chestplate`, 3, 3, [
      ingredient, null, ingredient,
      ingredient, ingredient, ingredient,
      ingredient, ingredient, ingredient,
    ], new ItemStack(`${material}_chestplate`, 'item', 1), false);
    tryRegisterShaped(`${material}_leggings`, 3, 3, [
      ingredient, ingredient, ingredient,
      ingredient, null, ingredient,
      ingredient, null, ingredient,
    ], new ItemStack(`${material}_leggings`, 'item', 1), false);
    tryRegisterShaped(`${material}_boots`, 3, 2, [
      ingredient, null, ingredient,
      ingredient, null, ingredient,
    ], new ItemStack(`${material}_boots`, 'item', 1), false);
  }

  // Tools & Weapons across materials
  const toolMaterials: ReadonlyArray<readonly [string | number, string, string, string, string, string]> = [
    // [ingredientId, pickaxe, axe, shovel, sword, hoe]
    [BlockIds.Planks, 'wood_pickaxe', 'wood_axe', 'wood_shovel', 'wood_sword', 'wood_hoe'],
    [BlockIds.Cobblestone, 'stone_pickaxe', 'stone_axe', 'stone_shovel', 'stone_sword', 'stone_hoe'],
    ['iron_ingot', 'iron_pickaxe', 'iron_axe', 'iron_shovel', 'iron_sword', 'iron_hoe'],
    ['diamond', 'diamond_pickaxe', 'diamond_axe', 'diamond_shovel', 'diamond_sword', 'diamond_hoe'],
    ['gold_ingot', 'gold_pickaxe', 'gold_axe', 'gold_shovel', 'gold_sword', 'gold_hoe'],
  ];

  for (const [matId, pick, axe, shovel, sword, hoe] of toolMaterials) {
    const ing: { id: string | number; metadata?: number | undefined } = matId === BlockIds.Planks ? { id: matId, metadata: -1 } : { id: matId };
    const stick = { id: 'stick' };

    // Pickaxe
    tryRegisterShaped(`${pick}_shaped`, 3, 3, [
      ing,   ing,   ing,
      null,  stick, null,
      null,  stick, null
    ], new ItemStack(pick, 'item', 1, 0), false);

    // Axe (Mirrored)
    tryRegisterShaped(`${axe}_shaped`, 2, 3, [
      ing,   ing,
      ing,   stick,
      null,  stick
    ], new ItemStack(axe, 'item', 1, 0), true);

    // Shovel
    tryRegisterShaped(`${shovel}_shaped`, 1, 3, [
      ing,
      stick,
      stick
    ], new ItemStack(shovel, 'item', 1, 0), false);

    // Sword
    tryRegisterShaped(`${sword}_shaped`, 1, 3, [
      ing,
      ing,
      stick
    ], new ItemStack(sword, 'item', 1, 0), false);

    // Hoe (Mirrored)
    tryRegisterShaped(`${hoe}_shaped`, 2, 3, [
      ing,   ing,
      null,  stick,
      null,  stick
    ], new ItemStack(hoe, 'item', 1, 0), true);
  }

  // ---------------------------------------------------------------- armour
  // Beta RecipesArmor: helmet "XXX"/"X X", chestplate "X X"/"XXX"/"XXX",
  // leggings "XXX"/"X X"/"X X", boots "X X"/"X X".
  const ARMOUR_MATERIALS: readonly { readonly ingredient: string; readonly prefix: string }[] = [
    { ingredient: 'leather', prefix: 'leather' },
    { ingredient: 'iron_ingot', prefix: 'iron' },
    { ingredient: 'diamond', prefix: 'diamond' },
    { ingredient: 'gold_ingot', prefix: 'gold' },
  ];
  for (const { ingredient, prefix } of ARMOUR_MATERIALS) {
    const x = { id: ingredient };
    tryRegisterShaped(`${prefix}_helmet`, 3, 2, [
      x, x, x,
      x, null, x,
    ], new ItemStack(`${prefix}_helmet`, 'item', 1, 0), false);
    tryRegisterShaped(`${prefix}_chestplate`, 3, 3, [
      x, null, x,
      x, x, x,
      x, x, x,
    ], new ItemStack(`${prefix}_chestplate`, 'item', 1, 0), false);
    tryRegisterShaped(`${prefix}_leggings`, 3, 3, [
      x, x, x,
      x, null, x,
      x, null, x,
    ], new ItemStack(`${prefix}_leggings`, 'item', 1, 0), false);
    tryRegisterShaped(`${prefix}_boots`, 3, 2, [
      x, null, x,
      x, null, x,
    ], new ItemStack(`${prefix}_boots`, 'item', 1, 0), false);
  }

  // ------------------------------------------------------- weapons & tools
  // Beta RecipesWeapons: bow is " #X"/"# X"/" #X" with string and sticks.
  tryRegisterShaped('bow', 3, 3, [
    null, { id: 'stick' }, { id: 'string' },
    { id: 'stick' }, null, { id: 'string' },
    null, { id: 'stick' }, { id: 'string' },
  ], new ItemStack('bow', 'item', 1, 0), true);

  tryRegisterShaped('arrow', 1, 3, [
    { id: 'flint' },
    { id: 'stick' },
    { id: 'feather' },
  ], new ItemStack('arrow', 'item', 4, 0), false);

  tryRegisterShaped('fishing_rod', 3, 3, [
    null, null, { id: 'stick' },
    null, { id: 'stick' }, { id: 'string' },
    { id: 'stick' }, null, { id: 'string' },
  ], new ItemStack('fishing_rod', 'item', 1, 0), true);

  // ------------------------------------------------------------- utilities
  tryRegisterShaped('bucket', 3, 2, [
    { id: 'iron_ingot' }, null, { id: 'iron_ingot' },
    null, { id: 'iron_ingot' }, null,
  ], new ItemStack('bucket_empty', 'item', 1, 0), false);

  tryRegisterShaped('compass', 3, 3, [
    null, { id: 'iron_ingot' }, null,
    { id: 'iron_ingot' }, { id: 'redstone_dust' }, { id: 'iron_ingot' },
    null, { id: 'iron_ingot' }, null,
  ], new ItemStack('compass', 'item', 1, 0), false);

  tryRegisterShaped('clock', 3, 3, [
    null, { id: 'gold_ingot' }, null,
    { id: 'gold_ingot' }, { id: 'redstone_dust' }, { id: 'gold_ingot' },
    null, { id: 'gold_ingot' }, null,
  ], new ItemStack('clock', 'item', 1, 0), false);

  tryRegisterShaped('boat', 3, 2, [
    { id: BlockIds.Planks, metadata: -1 }, null, { id: BlockIds.Planks, metadata: -1 },
    { id: BlockIds.Planks, metadata: -1 }, { id: BlockIds.Planks, metadata: -1 }, { id: BlockIds.Planks, metadata: -1 },
  ], new ItemStack('boat', 'item', 1, 0), false);

  tryRegisterShaped('minecart', 3, 2, [
    { id: 'iron_ingot' }, null, { id: 'iron_ingot' },
    { id: 'iron_ingot' }, { id: 'iron_ingot' }, { id: 'iron_ingot' },
  ], new ItemStack('minecart', 'item', 1, 0), false);

  tryRegisterShaped('paper', 3, 1, [
    { id: 'reeds' }, { id: 'reeds' }, { id: 'reeds' },
  ], new ItemStack('paper', 'item', 3, 0), false);

  tryRegisterShaped('book', 1, 3, [
    { id: 'paper' }, { id: 'paper' }, { id: 'paper' },
  ], new ItemStack('book_normal', 'item', 1, 0), false);

  tryRegisterShaped('bowl', 3, 2, [
    { id: BlockIds.Planks, metadata: -1 }, null, { id: BlockIds.Planks, metadata: -1 },
    null, { id: BlockIds.Planks, metadata: -1 }, null,
  ], new ItemStack('bowl', 'item', 4, 0), false);

  // ---------------------------------------------------------------- blocks
  tryRegisterShaped('furnace', 3, 3, [
    { id: BlockIds.Cobblestone }, { id: BlockIds.Cobblestone }, { id: BlockIds.Cobblestone },
    { id: BlockIds.Cobblestone }, null, { id: BlockIds.Cobblestone },
    { id: BlockIds.Cobblestone }, { id: BlockIds.Cobblestone }, { id: BlockIds.Cobblestone },
  ], new ItemStack(BlockIds.Furnace, 'block', 1, 0), false);

  tryRegisterShaped('fence', 3, 2, [
    { id: 'stick' }, { id: 'stick' }, { id: 'stick' },
    { id: 'stick' }, { id: 'stick' }, { id: 'stick' },
  ], new ItemStack(BlockIds.Fence, 'block', 2, 0), false);

  tryRegisterShaped('cobblestone_stairs', 3, 3, [
    { id: BlockIds.Cobblestone }, null, null,
    { id: BlockIds.Cobblestone }, { id: BlockIds.Cobblestone }, null,
    { id: BlockIds.Cobblestone }, { id: BlockIds.Cobblestone }, { id: BlockIds.Cobblestone },
  ], new ItemStack(BlockIds.CobblestoneStairs, 'block', 4, 0), true);

  tryRegisterShaped('snow_block', 2, 2, [
    { id: 'snowball' }, { id: 'snowball' },
    { id: 'snowball' }, { id: 'snowball' },
  ], new ItemStack(BlockIds.SnowBlock, 'block', 1, 0), false);

  tryRegisterShaped('clay_block', 2, 2, [
    { id: 'clay_ball' }, { id: 'clay_ball' },
    { id: 'clay_ball' }, { id: 'clay_ball' },
  ], new ItemStack(BlockIds.Clay, 'block', 1, 0), false);

  tryRegisterShaped('wool_from_string', 2, 2, [
    { id: 'string' }, { id: 'string' },
    { id: 'string' }, { id: 'string' },
  ], new ItemStack(BlockIds.Wool, 'block', 1, 0), false);

  tryRegisterShaped('rail', 3, 3, [
    { id: 'iron_ingot' }, null, { id: 'iron_ingot' },
    { id: 'iron_ingot' }, { id: 'stick' }, { id: 'iron_ingot' },
    { id: 'iron_ingot' }, null, { id: 'iron_ingot' },
  ], new ItemStack(BlockIds.Rail, 'block', 16, 0), false);

  tryRegisterShaped('powered_rail', 3, 3, [
    { id: 'gold_ingot' }, null, { id: 'gold_ingot' },
    { id: 'gold_ingot' }, { id: 'stick' }, { id: 'gold_ingot' },
    { id: 'gold_ingot' }, { id: 'redstone_dust' }, { id: 'gold_ingot' },
  ], new ItemStack(BlockIds.PoweredRail, 'block', 6, 0), false);

  tryRegisterShaped('detector_rail', 3, 3, [
    { id: 'iron_ingot' }, null, { id: 'iron_ingot' },
    { id: 'iron_ingot' }, { id: 'stone_pressure_plate' }, { id: 'iron_ingot' },
    { id: 'iron_ingot' }, { id: 'redstone_dust' }, { id: 'iron_ingot' },
  ], new ItemStack(BlockIds.DetectorRail, 'block', 6, 0), false);

  tryRegisterShaped('redstone_torch', 1, 2, [
    { id: 'redstone_dust' },
    { id: 'stick' },
  ], new ItemStack(BlockIds.RedstoneTorchOn, 'block', 1, 0), false);

  tryRegisterShaped('lever', 1, 2, [
    { id: 'stick' },
    { id: BlockIds.Cobblestone },
  ], new ItemStack(BlockIds.Lever, 'block', 1, 0), false);

  tryRegisterShaped('stone_button', 1, 2, [
    { id: BlockIds.Stone },
    { id: BlockIds.Stone },
  ], new ItemStack(BlockIds.StoneButton, 'block', 1, 0), false);

  // ------------------------------------------------------------------ food
  // Beta RecipesFood: mushroom stew accepts either mushroom order.
  tryRegisterShaped('mushroom_stew_a', 1, 3, [
    { id: BlockIds.RedMushroom },
    { id: BlockIds.BrownMushroom },
    { id: 'bowl' },
  ], new ItemStack('mushroom_stew', 'item', 1, 0), false);
  tryRegisterShaped('mushroom_stew_b', 1, 3, [
    { id: BlockIds.BrownMushroom },
    { id: BlockIds.RedMushroom },
    { id: 'bowl' },
  ], new ItemStack('mushroom_stew', 'item', 1, 0), false);

  tryRegisterShaped('bread', 3, 1, [
    { id: 'wheat' }, { id: 'wheat' }, { id: 'wheat' },
  ], new ItemStack('bread', 'item', 1, 0), false);

  tryRegisterShaped('cookie', 3, 1, [
    { id: 'wheat' }, { id: 'dye_powder_brown' }, { id: 'wheat' },
  ], new ItemStack('cookie', 'item', 8, 0), false);

  tryRegisterShaped('golden_apple', 3, 3, [
    { id: 'gold_ingot' }, { id: 'gold_ingot' }, { id: 'gold_ingot' },
    { id: 'gold_ingot' }, { id: 'apple' }, { id: 'gold_ingot' },
    { id: 'gold_ingot' }, { id: 'gold_ingot' }, { id: 'gold_ingot' },
  ], new ItemStack('apple_golden', 'item', 1, 0), false);

  // ------------------------------------------------------------------ dyes
  // Beta RecipesDyes: flowers and bone grind into dye.
  tryRegisterShapeless('dye_yellow', [{ id: BlockIds.Dandelion }], new ItemStack('dye_powder_yellow', 'item', 2, 11));
  tryRegisterShapeless('dye_red', [{ id: BlockIds.Rose }], new ItemStack('dye_powder_red', 'item', 2, 1));
  tryRegisterShapeless('dye_bonemeal', [{ id: 'bone' }], new ItemStack('dye_powder_white', 'item', 3, 15));


  // ------------------------------------------------- Beta storage blocks
  // RecipesIngots: 3x3 of the material packs into a block, and one block
  // unpacks back into nine. Lapis packs from dye metadata 4.
  const STORAGE_BLOCKS: readonly { readonly block: number; readonly item: string; readonly name: string }[] = [
    { block: BlockIds.GoldBlock, item: 'gold_ingot', name: 'gold' },
    { block: BlockIds.IronBlock, item: 'iron_ingot', name: 'iron' },
    { block: BlockIds.DiamondBlock, item: 'diamond', name: 'diamond' },
    { block: BlockIds.LapisBlock, item: 'dye_powder_blue', name: 'lapis' },
  ];
  for (const { block, item, name } of STORAGE_BLOCKS) {
    const cell = { id: item };
    tryRegisterShaped(`${name}_block`, 3, 3, [
      cell, cell, cell,
      cell, cell, cell,
      cell, cell, cell,
    ], new ItemStack(block, 'block', 1, 0), false);
    // Reverse recipe: one block yields nine of the material.
    tryRegisterShaped(`${name}_block_unpack`, 1, 1, [
      { id: block },
    ], new ItemStack(item, 'item', 9, 0), false);
  }

  tryRegisterShaped('sandstone', 2, 2, [
    { id: BlockIds.Sand }, { id: BlockIds.Sand },
    { id: BlockIds.Sand }, { id: BlockIds.Sand },
  ], new ItemStack(BlockIds.SandStone, 'block', 1, 0), false);

  tryRegisterShaped('brick_block', 2, 2, [
    { id: 'brick' }, { id: 'brick' },
    { id: 'brick' }, { id: 'brick' },
  ], new ItemStack(BlockIds.BrickBlock, 'block', 1, 0), false);

  // Beta 1.7.3 has no glowstone crafting recipe: glowstone dust is a Nether
  // drop and the block cannot be reassembled. Intentionally absent.

  // Beta ItemBed recipe: three wool over three planks.
  tryRegisterShaped('bed', 3, 2, [
    { id: BlockIds.Wool, metadata: -1 }, { id: BlockIds.Wool, metadata: -1 }, { id: BlockIds.Wool, metadata: -1 },
    { id: BlockIds.Planks, metadata: -1 }, { id: BlockIds.Planks, metadata: -1 }, { id: BlockIds.Planks, metadata: -1 },
  ], new ItemStack('bed', 'item', 1, 0), false);

  // Beta ItemPainting recipe: eight sticks around wool.
  tryRegisterShaped('painting', 3, 3, [
    { id: 'stick' }, { id: 'stick' }, { id: 'stick' },
    { id: 'stick' }, { id: BlockIds.Wool, metadata: -1 }, { id: 'stick' },
    { id: 'stick' }, { id: 'stick' }, { id: 'stick' },
  ], new ItemStack('painting', 'item', 1, 0), false);

}
