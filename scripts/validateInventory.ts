import { Inventory } from '../src/inventory/Inventory.ts';
import { ItemStack } from '../src/inventory/ItemStack.ts';
import { InventoryTransferService } from '../src/inventory/InventoryTransferService.ts';
import { InventorySerializer } from '../src/inventory/InventorySerializer.ts';
import { BlockIds } from '../src/blocks/BlockId.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`[VALIDATION FAILED] ${message}`);
    process.exit(1);
  }
}

function testStackMovementAndSplitting(): void {
  const inv = new Inventory();
  inv.setStack(0, new ItemStack(BlockIds.Stone, 'block', 5, 0));

  // 1. Right click picking up half (ceil(5/2) = 3 taken, 2 left)
  let res = InventoryTransferService.rightClickSlot(inv, 0, null);
  assert(res.cursorStack !== null && res.cursorStack.count === 3, 'Right click on stack of 5 picks up half (3)');
  assert(inv.getStack(0)!.count === 2, 'Right click leaves 2 items in slot 0');

  // 2. Right click placing 1 item into empty slot 9
  res = InventoryTransferService.rightClickSlot(inv, 9, res.cursorStack);
  assert(inv.getStack(9) !== null && inv.getStack(9)!.count === 1, 'Right click on empty slot places 1 item');
  assert(res.cursorStack !== null && res.cursorStack.count === 2, 'Cursor stack count decremented to 2');

  // 3. Left click placing remaining cursor stack into slot 10
  res = InventoryTransferService.leftClickSlot(inv, 10, res.cursorStack);
  assert(res.cursorStack === null, 'Left click places all remaining cursor items into empty slot');
  assert(inv.getStack(10)!.count === 2, 'Slot 10 now holds 2 items');
}

function testStackMergingAndSwapping(): void {
  const inv = new Inventory();
  inv.setStack(0, new ItemStack(BlockIds.Dirt, 'block', 60, 0));
  const cursor = new ItemStack(BlockIds.Dirt, 'block', 10, 0);

  // 1. Merging partial stack beyond max stack size (64)
  const res = InventoryTransferService.leftClickSlot(inv, 0, cursor);
  assert(inv.getStack(0)!.count === 64, 'Slot 0 merged up to max stack size (64)');
  assert(res.cursorStack !== null && res.cursorStack.count === 6, 'Cursor stack retains remaining 6 overflow items');

  // 2. Swapping incompatible stacks
  inv.setStack(1, new ItemStack(BlockIds.Stone, 'block', 15, 0));
  const swapRes = InventoryTransferService.leftClickSlot(inv, 1, res.cursorStack);
  assert(inv.getStack(1)!.identity.id === BlockIds.Dirt && inv.getStack(1)!.count === 6, 'Slot 1 swapped to hold cursor dirt stack');
  assert(swapRes.cursorStack !== null && swapRes.cursorStack.identity.id === BlockIds.Stone && swapRes.cursorStack.count === 15, 'Cursor now holds swapped stone stack');
}

function testShiftClickAndInsertionPriority(): void {
  const inv = new Inventory();
  // Set up existing partial stack in main inventory slot 15
  inv.setStack(15, new ItemStack(BlockIds.Planks, 'block', 10, 0));
  // Place stack in hotbar slot 0 to shift click
  inv.setStack(0, new ItemStack(BlockIds.Planks, 'block', 20, 0));

  // 1. Shift click moves from hotbar (0..8) to main inventory (9..35) with merge-first priority
  InventoryTransferService.shiftClickSlot(inv, 0);
  assert(inv.getStack(0) === null, 'Slot 0 fully transferred via shift click');
  assert(inv.getStack(15)!.count === 30, 'Existing partial stack in slot 15 merged first to 30');

  // 2. Test inventory.insert priority: existing partial -> hotbar (0..8) -> inventory (9..35)
  const accepted = inv.insert('block', BlockIds.Planks, 40, 0);
  assert(accepted === 40, 'All 40 planks accepted');
  assert(inv.getStack(15)!.count === 64, 'Existing partial stack filled to max (64)');
  assert(inv.getStack(0)!.count === 6, 'Remaining 6 items placed into empty hotbar slot 0');
}

function testDragAndNumberKeySwap(): void {
  const inv = new Inventory();
  const cursor = new ItemStack(BlockIds.Glass, 'block', 10, 0);

  // 1. Right-drag distribution: exactly 1 item per unique slot
  const dragSet = new Set<number>([9, 10, 11]);
  const res = InventoryTransferService.rightDrag(inv, dragSet, cursor);
  assert(inv.getStack(9)!.count === 1 && inv.getStack(10)!.count === 1 && inv.getStack(11)!.count === 1, 'Right drag placed exactly 1 item per slot');
  assert(res.cursorStack !== null && res.cursorStack.count === 7, 'Cursor count decremented correctly by 3');

  // 2. Number key swap while modal is open
  inv.setStack(2, new ItemStack(BlockIds.Log, 'block', 5, 0));
  InventoryTransferService.numberKeySwap(inv, 9, 2); // Swap slot 9 (1 glass) with hotbar slot 2 (5 log)
  assert(inv.getStack(9)!.identity.id === BlockIds.Log && inv.getStack(9)!.count === 5, 'Main slot 9 now holds 5 logs via number key swap');
  assert(inv.getStack(2)!.identity.id === BlockIds.Glass && inv.getStack(2)!.count === 1, 'Hotbar slot 2 now holds 1 glass via number key swap');
}

function testInventoryPersistence(): void {
  const inv = new Inventory();
  inv.setStack(0, new ItemStack(BlockIds.Stone, 'block', 32, 0));
  inv.setStack(18, new ItemStack('diamond_pickaxe', 'item', 1, 0));

  const serialized = InventorySerializer.serialize(inv, 0);
  const restoredInv = new Inventory();
  InventorySerializer.deserialize(restoredInv, serialized.inventory);

  assert(restoredInv.getStack(0) !== null && restoredInv.getStack(0)!.count === 32, 'Restored slot 0 matches count 32');
  assert(restoredInv.getStack(18) !== null && restoredInv.getStack(18)!.identity.id === 'diamond_pickaxe', 'Restored slot 18 matches diamond pickaxe');
  assert(restoredInv.getStack(35) === null, 'Restored slot 35 is empty');
}

function main(): void {
  testStackMovementAndSplitting();
  testStackMergingAndSwapping();
  testShiftClickAndInsertionPriority();
  testDragAndNumberKeySwap();
  testInventoryPersistence();
  console.log('Inventory Validation Passed.');
  process.exit(0);
}

main();
