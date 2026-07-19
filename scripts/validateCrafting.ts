import { RecipeRegistry } from '../src/crafting/RecipeRegistry.ts';
import { ShapedRecipe } from '../src/crafting/ShapedRecipe.ts';
import { ShapelessRecipe } from '../src/crafting/ShapelessRecipe.ts';
import { CraftingGrid } from '../src/crafting/CraftingGrid.ts';
import { CraftingMatcher } from '../src/crafting/CraftingMatcher.ts';
import { CraftingTransferService } from '../src/crafting/CraftingTransferService.ts';
import { BlockIds } from '../src/blocks/BlockId.ts';
import { BlockRegistry } from '../src/blocks/BlockRegistry.ts';
import { registerDefaultBlocks } from '../src/blocks/registerDefaultBlocks.ts';
import { resolveBlockTexture } from '../src/blocks/resolveBlockTexture.ts';
import { MenuInputRouter } from '../src/input/MenuInputRouter.ts';
import { ItemStack } from '../src/inventory/ItemStack.ts';
import { Inventory } from '../src/inventory/Inventory.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`[CRAFTING VALIDATION FAILED] ${message}`);
    process.exit(1);
  }
}

function testShapedAndMirroredMatching(): void {
  const registry = new RecipeRegistry();
  // Register sticks (1x2 shaped: Planks over Planks)
  const sticksRecipe = new ShapedRecipe(1, 2, [{ id: BlockIds.Planks, metadata: -1 }, { id: BlockIds.Planks, metadata: -1 }], new ItemStack('stick', 'item', 4, 0), false);
  registry.register(sticksRecipe);

  // Register shears (2x2 mirrored: iron diagonal)
  const shearsRecipe = new ShapedRecipe(2, 2, [{ id: 'iron_ingot' }, null, null, { id: 'iron_ingot' }], new ItemStack('shears', 'item', 1, 0), true);
  registry.register(shearsRecipe);

  const grid2x2 = new CraftingGrid(2, 2);
  grid2x2.setStack(0, new ItemStack(BlockIds.Planks, 'block', 5, 0));
  grid2x2.setStack(2, new ItemStack(BlockIds.Planks, 'block', 5, 0)); // Column 0 of 2x2 grid

  const match = CraftingMatcher.findMatchingRecipe(grid2x2, registry);
  assert(match !== null && match.output.identity.id === 'stick' && match.output.count === 4, 'Sticks recipe matched in 2x2 grid');

  // Test mirrored shears pattern in 2x2
  grid2x2.clear();
  grid2x2.setStack(1, new ItemStack('iron_ingot', 'item', 2, 0));
  grid2x2.setStack(2, new ItemStack('iron_ingot', 'item', 2, 0)); // Mirrored diagonal
  const mirroredMatch = CraftingMatcher.findMatchingRecipe(grid2x2, registry);
  assert(mirroredMatch !== null && mirroredMatch.output.identity.id === 'shears', 'Mirrored shears recipe matched successfully');
}

function testShapelessAndDimensionBoundary(): void {
  const registry = new RecipeRegistry();
  // Shapeless mushroom stew (bowl + brown mushroom + red mushroom)
  registry.register(new ShapelessRecipe([
    { id: 'bowl' }, { id: BlockIds.BrownMushroom }, { id: BlockIds.RedMushroom }
  ], new ItemStack('mushroom_stew', 'item', 1, 0)));

  // 3x3 shaped chest recipe
  const chestRecipe = new ShapedRecipe(3, 3, [
    { id: BlockIds.Planks, metadata: -1 }, { id: BlockIds.Planks, metadata: -1 }, { id: BlockIds.Planks, metadata: -1 },
    { id: BlockIds.Planks, metadata: -1 }, null,                                  { id: BlockIds.Planks, metadata: -1 },
    { id: BlockIds.Planks, metadata: -1 }, { id: BlockIds.Planks, metadata: -1 }, { id: BlockIds.Planks, metadata: -1 }
  ], new ItemStack(BlockIds.Chest, 'block', 1, 0), false);
  registry.register(chestRecipe);

  // 2x2 Grid must NOT match 3x3 recipes (`A 2x2 grid may only match recipes that fit within 2x2`)
  const grid2x2 = new CraftingGrid(2, 2);
  for (let i = 0; i < 4; i++) grid2x2.setStack(i, new ItemStack(BlockIds.Planks, 'block', 10, 0));
  assert(CraftingMatcher.findMatchingRecipe(grid2x2, registry) === null, '2x2 grid correctly rejects 3x3 recipes');

  // 3x3 Grid matches shapeless regardless of slot arrangement
  const grid3x3 = new CraftingGrid(3, 3);
  grid3x3.setStack(8, new ItemStack('bowl', 'item', 1, 0));
  grid3x3.setStack(1, new ItemStack(BlockIds.BrownMushroom, 'block', 1, 0));
  grid3x3.setStack(4, new ItemStack(BlockIds.RedMushroom, 'block', 1, 0));
  const shapelessMatch = CraftingMatcher.findMatchingRecipe(grid3x3, registry);
  assert(shapelessMatch !== null && shapelessMatch.output.identity.id === 'mushroom_stew', 'Shapeless recipe matched anywhere in 3x3 grid');
}

function testIngredientConsumptionAndContainerReturn(): void {
  const registry = new RecipeRegistry();
  // Cake recipe simulation with milk bucket container returns (`Only implement container-item returns for recipes/items confirmed by Beta 1.7.3`)
  const cakeRecipe = new ShapedRecipe(3, 3, [
    { id: 'bucket_milk' }, { id: 'bucket_milk' }, { id: 'bucket_milk' },
    { id: 'sugar' },       { id: 'egg' },         { id: 'sugar' },
    { id: 'wheat' },       { id: 'wheat' },       { id: 'wheat' }
  ], new ItemStack('cake', 'item', 1, 0), false);
  registry.register(cakeRecipe);

  const grid3x3 = new CraftingGrid(3, 3);
  for (let i = 0; i < 3; i++) grid3x3.setStack(i, new ItemStack('bucket_milk', 'item', 1, 0));
  grid3x3.setStack(3, new ItemStack('sugar', 'item', 2, 0));
  grid3x3.setStack(4, new ItemStack('egg', 'item', 2, 0));
  grid3x3.setStack(5, new ItemStack('sugar', 'item', 2, 0));
  for (let i = 6; i < 9; i++) grid3x3.setStack(i, new ItemStack('wheat', 'item', 2, 0));

  const inv = new Inventory();
  const mockIem = { spawnThrownItem: () => {} } as any;

  const match = CraftingMatcher.findMatchingRecipe(grid3x3, registry)!;
  grid3x3.consumePlan(match, inv, mockIem, { position: { x: 0, y: 64, z: 0 } } as any);

  // Check milk bucket slots now hold empty buckets (`bucket_milk` -> `bucket_empty`)
  assert(grid3x3.getStack(0)!.identity.id === 'bucket_empty', 'Milk bucket slot 0 converted to bucket_empty upon consumption');
  assert(grid3x3.getStack(1)!.identity.id === 'bucket_empty', 'Milk bucket slot 1 converted to bucket_empty upon consumption');
  assert(grid3x3.getStack(2)!.identity.id === 'bucket_empty', 'Milk bucket slot 2 converted to bucket_empty upon consumption');
  // Check sugar/egg/wheat consumed exactly 1
  assert(grid3x3.getStack(3)!.count === 1 && grid3x3.getStack(4)!.count === 1, 'Sugar and egg decremented exactly by 1');
}

function testShiftClickBatchAndCloseRecovery(): void {
  const registry = new RecipeRegistry();
  registry.register(new ShapedRecipe(1, 2, [{ id: BlockIds.Planks, metadata: -1 }, { id: BlockIds.Planks, metadata: -1 }], new ItemStack('stick', 'item', 4, 0), false));

  const grid2x2 = new CraftingGrid(2, 2);
  grid2x2.setStack(0, new ItemStack(BlockIds.Planks, 'block', 10, 0));
  grid2x2.setStack(2, new ItemStack(BlockIds.Planks, 'block', 10, 0));

  const inv = new Inventory();
  const mockIem = { spawnThrownItem: () => {} } as any;
  const mockPlayer = { position: { x: 0, y: 64, z: 0 } } as any;

  const resultStack = CraftingTransferService.onGridChanged(grid2x2, registry);
  assert(resultStack !== null && resultStack.identity.id === 'stick', 'Sticks output calculated');

  // Perform shift click batch crafting (`repeatedly rematch, check capacity, craft one and insert full result`)
  CraftingTransferService.onClickResultSlot(inv, grid2x2, resultStack, null, true, mockIem, mockPlayer, registry);
  assert(grid2x2.isEmpty(), 'Grid fully consumed after batch shift click');
  assert(inv.getStack(0)!.identity.id === 'stick' && inv.getStack(0)!.count === 40, 'All 40 sticks crafted and inserted directly into inventory');

  // Test close recovery (`merge_then_drop`)
  grid2x2.setStack(1, new ItemStack(BlockIds.Stone, 'block', 15, 0));
  CraftingTransferService.closeRecovery(grid2x2, inv, mockIem, mockPlayer);
  assert(grid2x2.isEmpty(), 'Grid cleared after closeRecovery');
  assert(inv.getStack(1) !== null && inv.getStack(1)!.identity.id === BlockIds.Stone && inv.getStack(1)!.count === 15, 'Recovered stone stack inserted safely into inventory slot 1');
}

function testMenuInputAndLeakageFixes(): void {
  // 1. Crafting table face resolution
  const reg = new BlockRegistry();
  registerDefaultBlocks(reg);
  const tableDef = reg.getById(BlockIds.CraftingTable)!;
  assert(tableDef !== undefined, 'CraftingTable (58) registered in BlockRegistry');
  assert(resolveBlockTexture(tableDef, 'top') === 'crafting_table_top', 'CraftingTable top face is crafting_table_top');
  assert(resolveBlockTexture(tableDef, 'front') === 'crafting_table_front', 'CraftingTable front face is crafting_table_front');
  assert(resolveBlockTexture(tableDef, 'side') === 'crafting_table_side', 'CraftingTable side face is crafting_table_side');
  assert(resolveBlockTexture(tableDef, 'bottom') === 'planks_oak', 'CraftingTable bottom face is planks_oak');

  // 2. Ladder texture resolution
  const ladderDef = reg.getById(BlockIds.Ladder)!;
  assert(resolveBlockTexture(ladderDef, 'side') === 'ladder', 'Ladder resolves to ladder texture without fire_layer_0 leakage');

  // 3. MenuInputRouter E key exclusivity check
  const invCtrl = { isOpen: false, close: () => { invCtrl.isOpen = false; }, open: () => { invCtrl.isOpen = true; }, updateScale: () => {} } as any;
  const tableCtrl = { isOpen: true, close: () => { tableCtrl.isOpen = false; }, open: () => { tableCtrl.isOpen = true; }, updateScale: () => {} } as any;
  const furnaceCtrl = { isOpen: false, close: () => {}, updateScale: () => {} } as any;
  const router = new MenuInputRouter(invCtrl, tableCtrl, furnaceCtrl, { scale: 3 } as any);
  
  // Simulate E key when table is open -> table closes ONLY, inventory does NOT open
  router['handleKeyDown']({ code: 'KeyE', preventDefault: () => {}, stopImmediatePropagation: () => {} } as any);
  assert(tableCtrl.isOpen === false && invCtrl.isOpen === false, 'E key closed crafting table and did NOT open inventory');
}

function main(): void {
  testShapedAndMirroredMatching();
  testShapelessAndDimensionBoundary();
  testIngredientConsumptionAndContainerReturn();
  testShiftClickBatchAndCloseRecovery();
  testMenuInputAndLeakageFixes();
  console.log('Crafting Validation Passed.');
  process.exit(0);
}

main();
