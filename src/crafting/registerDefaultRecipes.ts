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
export function registerDefaultRecipes(
  registry: RecipeRegistry,
  blockRegistry: BlockRegistry,
  itemIcons: ItemIconResolver
): void {
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
      console.warn(`[RecipeRegistry] Skipping recipe "${recipeName}": missing output asset/block "${output.identity.id}"`);
      return;
    }
    for (const ing of pattern) {
      if (ing !== null && !canRegister(ing.id, blockRegistry, itemIcons)) {
        console.warn(`[RecipeRegistry] Skipping recipe "${recipeName}": missing ingredient asset/block "${ing.id}"`);
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
      console.warn(`[RecipeRegistry] Skipping recipe "${recipeName}": missing output asset/block "${output.identity.id}"`);
      return;
    }
    for (const ing of ingredients) {
      if (!canRegister(ing.id, blockRegistry, itemIcons)) {
        console.warn(`[RecipeRegistry] Skipping recipe "${recipeName}": missing ingredient asset/block "${ing.id}"`);
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
  ], new ItemStack(BlockIds.Slab, 'block', 3, 0), false);

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

  tryRegisterShaped('stone_button', 1, 2, [
    { id: BlockIds.Stone, metadata: -1 },
    { id: BlockIds.Stone, metadata: -1 }
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
}
