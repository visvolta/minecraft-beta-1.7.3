import { FurnaceContainer } from '../src/furnace/FurnaceContainer.ts';
import { FurnaceManager } from '../src/furnace/FurnaceManager.ts';
import { SmeltingRegistry } from '../src/furnace/SmeltingRegistry.ts';
import { FuelRegistry } from '../src/furnace/FuelRegistry.ts';
import { registerDefaultSmeltingAndFuels } from '../src/furnace/registerDefaultSmeltingAndFuels.ts';
import { FurnaceTransferService } from '../src/furnace/FurnaceTransferService.ts';
import { BlockRegistry } from '../src/blocks/BlockRegistry.ts';
import { registerDefaultBlocks } from '../src/blocks/registerDefaultBlocks.ts';
import { BlockIds } from '../src/blocks/BlockId.ts';
import { ItemStack } from '../src/inventory/ItemStack.ts';
import { Inventory } from '../src/inventory/Inventory.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`[FURNACE VALIDATION FAILED] ${message}`);
    process.exit(1);
  }
}

function testSmeltingAndFuelRegistries(): void {
  const blockRegistry = new BlockRegistry();
  registerDefaultBlocks(blockRegistry);
  const mockItemIcons = { isKnown: (_id: string) => true } as any;

  const smeltingReg = new SmeltingRegistry();
  const fuelReg = new FuelRegistry();
  registerDefaultSmeltingAndFuels(smeltingReg, fuelReg, blockRegistry, mockItemIcons);

  // 1. Recipe lookup
  const ironOre = new ItemStack(BlockIds.IronOre, 'block', 1, 0);
  const ironRecipe = smeltingReg.getRecipe(ironOre);
  assert(ironRecipe !== undefined && ironRecipe.output.identity.id === 'iron_ingot' && ironRecipe.duration === 200, 'Iron ore smelting recipe registered with 200 tick duration');

  // 2. Fuel lookup
  const coal = new ItemStack('coal', 'item', 1, 0);
  assert(fuelReg.getBurnTime(coal) === 1600, 'Coal registered with 1600 tick burn time');
  const lavaBucket = new ItemStack('bucket_lava', 'item', 1, 0);
  assert(fuelReg.getBurnTime(lavaBucket) === 20000 && fuelReg.getContainerReturn(lavaBucket)!.identity.id === 'bucket_empty', 'Lava bucket registered with 20000 burn time and bucket_empty return');
}

function testFurnaceProcessingAndCapacity(): void {
  const blockRegistry = new BlockRegistry();
  registerDefaultBlocks(blockRegistry);
  const mockItemIcons = { isKnown: (_id: string) => true } as any;

  const smeltingReg = new SmeltingRegistry();
  const fuelReg = new FuelRegistry();
  registerDefaultSmeltingAndFuels(smeltingReg, fuelReg, blockRegistry, mockItemIcons);

  const container = new FurnaceContainer(10, 64, 10, 3);
  container.inputSlot = new ItemStack(BlockIds.IronOre, 'block', 2, 0);
  container.fuelSlot = new ItemStack('coal', 'item', 1, 0);

  // 1. Ignition and burn consumption
  container.tick(smeltingReg, fuelReg);
  assert(container.remainingBurnTime === 1600 && container.totalBurnTime === 1600, 'Furnace ignited and set total/remaining burn time to 1600');
  assert(container.fuelSlot === null, 'Coal fuel item consumed upon ignition');
  assert(container.smeltProgress === 1, 'Smelt progress advanced to 1 on ignition tick');

  // 2. Progress advancement
  for (let i = 0; i < 198; i++) {
    container.tick(smeltingReg, fuelReg);
  }
  assert(container.smeltProgress === 199 && container.inputSlot!.count === 2, 'Smelt progress at 199 without consuming input yet');

  // 3. Progress completion
  container.tick(smeltingReg, fuelReg);
  assert(container.smeltProgress === 0 && container.inputSlot!.count === 1, 'Smelt completed, progress reset to 0, input count decremented');
  assert(container.outputSlot !== null && container.outputSlot.identity.id === 'iron_ingot' && container.outputSlot.count === 1, 'Iron ingot output created');

  // 4. Output-capacity check
  container.outputSlot = new ItemStack('iron_ingot', 'item', 64, 0); // Full stack
  for (let i = 0; i < 50; i++) {
    container.tick(smeltingReg, fuelReg);
  }
  assert(container.smeltProgress === 0 && container.inputSlot!.count === 1, 'Smelt progress blocked when output slot is full');
}

function testFurnaceManagerAndLitTransitions(): void {
  const blockRegistry = new BlockRegistry();
  registerDefaultBlocks(blockRegistry);
  const mockItemIcons = { isKnown: (_id: string) => true } as any;

  const smeltingReg = new SmeltingRegistry();
  const fuelReg = new FuelRegistry();
  registerDefaultSmeltingAndFuels(smeltingReg, fuelReg, blockRegistry, mockItemIcons);

  const manager = new FurnaceManager();
  const c1 = manager.getOrCreate(0, 64, 0, 4);
  const c2 = manager.getOrCreate(10, 64, 10, 5); // Independent simultaneous furnace

  assert(manager.getContainers().length === 2 && c1 !== c2, 'Multiple furnaces tracked independently');

  c1.inputSlot = new ItemStack(BlockIds.IronOre, 'block', 1, 0);
  c1.fuelSlot = new ItemStack('coal', 'item', 1, 0);

  let setBlockCalls = 0;
  let lastSetBlockId = 0;
  const mockWorld = {
    isLoaded: (_x: number, _z: number) => true,
    getBlock: (_x: number, _y: number, _z: number) => BlockIds.Furnace,
    setBlock: (_x: number, _y: number, _z: number, id: number) => {
      setBlockCalls++;
      lastSetBlockId = id;
    },
    setBlockMetadata: () => {}
  } as any;

  manager.tick(mockWorld, smeltingReg, fuelReg);
  assert(setBlockCalls === 1 && lastSetBlockId === BlockIds.FurnaceBurning, 'Manager transitioned unlit (61) to lit (62) on ignition');
  assert(manager.get(0, 64, 0) === c1 && c1.facing === 4, 'Same container preserved across lit/unlit transition keyed by (x,y,z)');
}

function testShiftClickRoutingAndDestruction(): void {
  const blockRegistry = new BlockRegistry();
  registerDefaultBlocks(blockRegistry);
  const mockItemIcons = { isKnown: (_id: string) => true } as any;

  const smeltingReg = new SmeltingRegistry();
  const fuelReg = new FuelRegistry();
  registerDefaultSmeltingAndFuels(smeltingReg, fuelReg, blockRegistry, mockItemIcons);

  const container = new FurnaceContainer(5, 64, 5, 3);
  const inv = new Inventory();

  // 1. Shift click dual item (`Log`) -> routed to input slot first (`input_first` as approved)
  inv.setStack(0, new ItemStack(BlockIds.Log, 'block', 10, 0));
  FurnaceTransferService.onClickSlot(container, inv, 3, null, true, false, smeltingReg, fuelReg); // Player slot 0 is slot 3
  assert(container.inputSlot !== null && container.inputSlot.identity.id === BlockIds.Log && container.inputSlot.count === 10, 'Dual item Log routed to input slot first via shift click');
  assert(inv.getStack(0) === null, 'Player inventory slot cleared after shift click');

  // 2. Shift click fuel item (`coal`) -> routed to fuel slot
  inv.setStack(1, new ItemStack('coal', 'item', 5, 0));
  FurnaceTransferService.onClickSlot(container, inv, 4, null, true, false, smeltingReg, fuelReg);
  assert(container.fuelSlot !== null && container.fuelSlot.identity.id === 'coal' && container.fuelSlot.count === 5, 'Coal routed to fuel slot via shift click');

  // 3. Shift click output slot -> transactional transfer to player inventory (`rejects manual insert`)
  container.outputSlot = new ItemStack('iron_ingot', 'item', 15, 0);
  FurnaceTransferService.onClickSlot(container, inv, 2, null, true, false, smeltingReg, fuelReg);
  assert(container.outputSlot === null && inv.getStack(0)!.identity.id === 'iron_ingot' && inv.getStack(0)!.count === 15, 'Output slot shift-clicked into player inventory');

  // 4. Persistence verification
  const manager = new FurnaceManager();
  const fc = manager.getOrCreate(20, 64, 20, 2);
  fc.remainingBurnTime = 500;
  fc.totalBurnTime = 1600;
  fc.smeltProgress = 120;
  fc.inputSlot = new ItemStack(BlockIds.GoldOre, 'block', 8, 0);

  const serialized = manager.serialize();
  const restoredManager = new FurnaceManager();
  restoredManager.deserialize(serialized);
  const restoredFc = restoredManager.get(20, 64, 20)!;
  assert(restoredFc !== undefined && restoredFc.facing === 2 && restoredFc.remainingBurnTime === 500 && restoredFc.smeltProgress === 120, 'Furnace container state and timers restored exactly via persistence');
  assert(restoredFc.inputSlot!.identity.id === BlockIds.GoldOre && restoredFc.inputSlot!.count === 8, 'Furnace inventory restored exactly via persistence');
}

function main(): void {
  testSmeltingAndFuelRegistries();
  testFurnaceProcessingAndCapacity();
  testFurnaceManagerAndLitTransitions();
  testShiftClickRoutingAndDestruction();
  console.log('Furnace Validation Passed.');
  process.exit(0);
}

main();
