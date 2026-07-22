import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { ARMOUR_ITEM_IDS, ARMOUR_MATERIALS, ARMOUR_SLOTS, ARMOUR_SLOT_PROTECTION } from '../src/items/ArmourMaterial.ts';
import { DEFAULT_ITEM_DEFINITIONS } from '../src/items/ItemDefinitionRegistry.ts';
import { ItemStack } from '../src/inventory/ItemStack.ts';
import { Inventory } from '../src/inventory/Inventory.ts';
import { InventoryTransferService } from '../src/inventory/InventoryTransferService.ts';
import { InventorySerializer } from '../src/inventory/InventorySerializer.ts';
import { calculateDurabilityWeightedArmourValue, getArmourDurabilityDamage, reduceDamageByArmour } from '../src/player/ArmourProtection.ts';
import { getArmourIconStates } from '../src/player/ArmourHudRenderer.ts';
import { DamageSource } from '../src/entities/damage/DamageSource.ts';
import { Player } from '../src/player/Player.ts';
import { RecipeRegistry } from '../src/crafting/RecipeRegistry.ts';
import { registerDefaultRecipes } from '../src/crafting/registerDefaultRecipes.ts';
import { CraftingGrid } from '../src/crafting/CraftingGrid.ts';
import { CraftingMatcher } from '../src/crafting/CraftingMatcher.ts';
import { ItemIconResolver } from '../src/inventory/ItemIconResolver.ts';
import { BlockRegistry } from '../src/blocks/BlockRegistry.ts';
import { registerDefaultBlocks } from '../src/blocks/registerDefaultBlocks.ts';
import { BlockIds } from '../src/blocks/BlockId.ts';
import { BlockBehaviourRegistry } from '../src/world/BlockBehaviour.ts';
import { BlockUpdateWorld } from '../src/world/BlockUpdateWorld.ts';
import { ChunkManager } from '../src/world/ChunkManager.ts';
import { LightEngine } from '../src/world/generation/lighting/LightEngine.ts';
import { EntityManager } from '../src/entities/core/EntityManager.ts';
import { createDefaultEntityTypeRegistry } from '../src/entities/core/EntityType.ts';
import { JavaRandom } from '../src/world/generation/random/JavaRandom.ts';
import { ItemEntityManager } from '../src/entities/items/ItemEntityManager.ts';
import { DroppedItemEntity } from '../src/entities/items/DroppedItemEntity.ts';
import { PlayerDeathController } from '../src/player/PlayerDeathController.ts';
import { DeathScreen } from '../src/player/DeathScreen.ts';

function assert(value: boolean, message: string): void {
  if (!value) throw new Error(message);
}

function armour(id: string, damage = 0): ItemStack {
  return new ItemStack(id, 'item', 1, 0, damage);
}

function testDefinitions(): void {
  const textureNames: Record<string, string> = { chain: 'chainmail' };
  let count = 0;
  for (const [materialId, material] of Object.entries(ARMOUR_MATERIALS)) {
    for (const slot of ARMOUR_SLOTS) {
      const textureMaterial = textureNames[materialId] ?? materialId;
      const id = `${textureMaterial}_${slot}`;
      const definition = DEFAULT_ITEM_DEFINITIONS.get(id);
      assert(definition !== undefined, `${id} definition exists`);
      assert(definition === DEFAULT_ITEM_DEFINITIONS.get(ARMOUR_ITEM_IDS[materialId as keyof typeof ARMOUR_ITEM_IDS][slot]), `${id} numeric alias shares definition`);
      assert(definition?.armourSlot === slot, `${id} slot`);
      assert(definition?.armourMaterial === materialId, `${id} material`);
      assert(definition?.protection === ARMOUR_SLOT_PROTECTION[slot], `${id} protection`);
      assert(definition?.durability === material.durability[slot], `${id} durability`);
      assert(definition?.stackSize === 1, `${id} stack size one`);
      assert(new ItemIconResolver().resolve(String(ARMOUR_ITEM_IDS[materialId as keyof typeof ARMOUR_ITEM_IDS][slot])).endsWith(`/${id}.png`), `${id} numeric icon alias`);
      count++;
    }
  }
  assert(count === 20 && DEFAULT_ITEM_DEFINITIONS.values().filter((definition) => definition.armourSlot !== undefined).length === 20, 'exactly twenty canonical armour definitions');
}

function testSlotRestrictionsAndTransfers(): void {
  const inventory = new Inventory();
  const equipment = inventory.getEquipment()!;

  for (const slot of ARMOUR_SLOTS) {
    const matching = armour(`iron_${slot}`, 7);
    assert(equipment.accepts(slot, matching), `${slot} accepts matching piece`);
    for (const wrong of ARMOUR_SLOTS.filter((candidate) => candidate !== slot)) {
      assert(!equipment.accepts(slot, armour(`iron_${wrong}`)), `${slot} rejects ${wrong}`);
    }
    assert(!equipment.accepts(slot, new ItemStack('apple', 'item', 1)), `${slot} rejects ordinary item`);
  }

  let cursor: ItemStack | null = armour('iron_helmet', 11);
  cursor = InventoryTransferService.leftClickEquipmentSlot(equipment, 'helmet', cursor).cursorStack;
  assert(cursor === null && equipment.getStack('helmet')?.damage === 11, 'left click equips and preserves damage');
  cursor = InventoryTransferService.leftClickEquipmentSlot(equipment, 'helmet', null).cursorStack;
  assert(cursor?.identity.id === 'iron_helmet' && equipment.getStack('helmet') === null, 'left click removes armour');

  const wrongCursor = armour('iron_boots');
  const rejected = InventoryTransferService.leftClickEquipmentSlot(equipment, 'helmet', wrongCursor);
  assert(rejected.cursorStack === wrongCursor && equipment.getStack('helmet') === null, 'wrong-slot click is rejected atomically');

  equipment.setStack('helmet', armour('leather_helmet', 3));
  const replacement = armour('diamond_helmet', 99);
  const swapped = InventoryTransferService.leftClickEquipmentSlot(equipment, 'helmet', replacement);
  assert(equipment.getStack('helmet') === replacement && swapped.cursorStack?.identity.id === 'leather_helmet', 'compatible click swaps pieces');

  const dragged = armour('iron_boots', 15);
  const dragResult = InventoryTransferService.rightDragEquipmentSlot(equipment, 'boots', dragged);
  assert(dragResult.cursorStack === null && equipment.getStack('boots')?.damage === 15, 'right drag equips compatible piece');
  const dragWrong = armour('iron_leggings');
  assert(InventoryTransferService.rightDragEquipmentSlot(equipment, 'chestplate', dragWrong).cursorStack === dragWrong, 'right drag rejects incompatible piece');

  inventory.setStack(9, armour('iron_chestplate', 44));
  InventoryTransferService.shiftClickSlot(inventory, 9);
  assert(inventory.getStack(9) === null && equipment.getStack('chestplate')?.damage === 44, 'shift-click equips damaged armour');
  assert(InventoryTransferService.shiftClickEquipmentSlot(inventory, equipment, 'chestplate'), 'shift-click unequips when storage exists');
  assert(equipment.getStack('chestplate') === null && inventory.getSlots().some((stack) => stack?.identity.id === 'iron_chestplate' && stack.damage === 44), 'shift-click unequip preserves damage');

  equipment.setStack('leggings', armour('iron_leggings', 12));
  for (let i = 0; i < 36; i++) inventory.setStack(i, new ItemStack(BlockIds.Dirt, 'block', 64));
  assert(!InventoryTransferService.shiftClickEquipmentSlot(inventory, equipment, 'leggings') && equipment.getStack('leggings')?.damage === 12, 'full inventory leaves equipped armour untouched');

  inventory.clear();
  inventory.setStack(0, armour('gold_helmet', 20));
  assert(InventoryTransferService.autoEquipFromInventorySlot(inventory, 0), 'right-click auto-equips');
  inventory.setStack(0, armour('diamond_helmet', 100));
  assert(InventoryTransferService.autoEquipFromInventorySlot(inventory, 0), 'right-click atomically swaps occupied slot');
  assert(equipment.getStack('helmet')?.identity.id === 'diamond_helmet' && equipment.getStack('helmet')?.damage === 100, 'replacement equipped with damage');
  assert(inventory.getStack(0)?.identity.id === 'gold_helmet' && inventory.getStack(0)?.damage === 20, 'old piece returns to source hotbar slot');

  inventory.setStack(1, new ItemStack('apple', 'item', 1));
  assert(!InventoryTransferService.numberKeySwapEquipment(inventory, equipment, 'boots', 1), 'number key rejects incompatible hotbar item');
  inventory.setStack(1, armour('diamond_boots', 31));
  assert(InventoryTransferService.numberKeySwapEquipment(inventory, equipment, 'boots', 1), 'number key swaps compatible armour');
  assert(equipment.getStack('boots')?.damage === 31, 'number-key swap preserves damage');
}

function testAllDamageTransferPaths(): void {
  const inventory = new Inventory();
  inventory.setStack(0, new ItemStack('stone_pickaxe', 'item', 1, 0, 41));
  const picked = InventoryTransferService.rightClickSlot(inventory, 0, null).cursorStack;
  assert(picked?.damage === 41, 'right-click pickup preserves damage');
  const placed = InventoryTransferService.rightClickSlot(inventory, 1, picked).cursorStack;
  assert(placed === null && inventory.getStack(1)?.damage === 41, 'right-click placement preserves damage');

  inventory.setStack(9, new ItemStack('iron_pickaxe', 'item', 1, 0, 87));
  InventoryTransferService.shiftClickSlot(inventory, 9);
  assert(inventory.getStack(0)?.damage === 87, 'ordinary shift-click preserves damage');

  const source = new Inventory(1, false);
  const target = new Inventory(1, false);
  source.setStack(0, new ItemStack('diamond_pickaxe', 'item', 1, 0, 777));
  InventoryTransferService.shiftClickBetweenInventories(source, 0, target);
  assert(target.getStack(0)?.damage === 777, 'cross-container shift transfer preserves damage');
}

function testProtectionAndDurability(): void {
  const empty: (ItemStack | null)[] = [null, null, null, null];
  assert(calculateDurabilityWeightedArmourValue(empty) === 0, 'no armour gives zero');
  assert(calculateDurabilityWeightedArmourValue([armour('leather_helmet'), null, null, null]) === 3, 'one full helmet gives three');
  for (const material of ['leather', 'iron', 'diamond'] as const) {
    const full = ARMOUR_SLOTS.map((slot) => armour(`${material}_${slot}`));
    assert(calculateDurabilityWeightedArmourValue(full) === 20, `full ${material} gives twenty`);
  }
  const mixed = [armour('leather_helmet'), armour('diamond_chestplate'), armour('gold_leggings'), armour('iron_boots')];
  assert(calculateDurabilityWeightedArmourValue(mixed) === 20, 'mixed undamaged suit gives twenty');
  mixed[0]!.damage = 32;
  const expected = Math.floor((19 * ((33 - 32) + 384 + 90 + 156)) / (33 + 384 + 90 + 156)) + 1;
  assert(calculateDurabilityWeightedArmourValue(mixed) === expected, 'mixed durability-weighted formula exact');

  assert(getArmourDurabilityDamage(1) === 1 && getArmourDurabilityDamage(7) === 1 && getArmourDurabilityDamage(8) === 2, 'armour wear is floor(damage/4), minimum one');
  const reduced = reduceDamageByArmour(8, 20, 0);
  assert(reduced.healthDamage === 1 && reduced.remainder === 15, 'twenty armour uses 25-point reduction and remainder');
  const next = reduceDamageByArmour(1, 20, reduced.remainder);
  assert(next.healthDamage === 0 && next.remainder === 20, 'damage remainder carries between accepted hits');

  const inventory = new Inventory();
  const equipment = inventory.getEquipment()!;
  const player = new Player(0, 64, 0);
  player.setEquipment(equipment);
  for (const slot of ARMOUR_SLOTS) equipment.setStack(slot, armour(`iron_${slot}`));
  assert(player.attackEntityFrom(DamageSource.mob({ position: { x: 1, y: 64, z: 0 } }), 8), 'armoured hit accepted');
  assert(player.health === 19, 'full suit reduces eight accepted damage to one health');
  assert(ARMOUR_SLOTS.every((slot) => equipment.getStack(slot)?.damage === 2), 'every piece loses the same floor(8/4) durability');
  assert(!player.attackEntityFrom(DamageSource.mob({ position: { x: 1, y: 64, z: 0 } }), 8), 'equal invulnerability-window hit rejected');
  assert(ARMOUR_SLOTS.every((slot) => equipment.getStack(slot)?.damage === 2), 'rejected hit applies no wear');
  assert(player.attackEntityFrom(DamageSource.mob({ position: { x: 1, y: 64, z: 0 } }), 10), 'stronger hit applies accepted excess');
  assert(ARMOUR_SLOTS.every((slot) => equipment.getStack(slot)?.damage === 3), 'accepted excess two applies minimum one wear');

  const bypassCases = [DamageSource.generic(), DamageSource.environment(), DamageSource.starve(), DamageSource.outOfWorld()];
  for (const source of bypassCases) assert(source.bypassesArmour, `${source.type} bypasses armour`);
  const protectedCases = [DamageSource.player(player), DamageSource.mob(player), DamageSource.projectile(player), DamageSource.explosion(player), DamageSource.fall(), DamageSource.fire(), DamageSource.lava(), DamageSource.drown(), DamageSource.suffocate(), DamageSource.cactus()];
  for (const source of protectedCases) assert(!source.bypassesArmour, `${source.type} is armour-reducible`);

  player.resetForRespawn(0, 64, 0);
  const beforeWear = equipment.getStack('helmet')!.damage;
  player.attackEntityFrom(DamageSource.starve(), 4);
  assert(player.health === 16 && equipment.getStack('helmet')?.damage === beforeWear, 'bypass applies directly and does not wear armour');

  equipment.clear();
  const nearHelmet = armour('leather_helmet', 32);
  const nearBoots = armour('leather_boots', 38);
  equipment.setStack('helmet', nearHelmet);
  equipment.setStack('boots', nearBoots);
  let breaks = 0;
  equipment.setBreakHandler(() => breaks++);
  player.resetForRespawn(0, 64, 0);
  player.attackEntityFrom(DamageSource.cactus(), 1);
  assert(equipment.getStack('helmet') === null && equipment.getStack('boots') === null && breaks === 2, 'multiple near-broken pieces break independently once');
  assert(equipment.getArmourValue() === 0, 'protection recalculates immediately after breakage');

  equipment.setStack('helmet', armour('leather_helmet', 30));
  equipment.setStack('boots', armour('leather_boots', 37));
  breaks = 0;
  for (let hit = 0; hit < 2; hit++) {
    player.hurtResistantTime = 0;
    player.attackEntityFrom(DamageSource.cactus(), 1);
  }
  assert(equipment.getStack('boots') === null && equipment.getStack('helmet')?.damage === 32 && breaks === 1, 'boots break first across successive accepted hits');
  player.hurtResistantTime = 0;
  player.attackEntityFrom(DamageSource.cactus(), 1);
  assert(equipment.getStack('helmet') === null && breaks === 2, 'remaining helmet breaks on a later accepted hit');
}

function testHudAssetsAndStates(): void {
  for (const [name, expectedHeight] of [['armourfill_full', 9], ['armourfill_half', 9], ['armour_empty', 9]] as const) {
    const bytes = readFileSync(`public/textures/gui/${name}.png`);
    assert(bytes.toString('ascii', 1, 4) === 'PNG', `${name} PNG signature`);
    assert(bytes.readUInt32BE(16) === 9 && bytes.readUInt32BE(20) === expectedHeight, `${name} supplied native dimensions preserved`);
    assert(bytes.includes(Buffer.from('tRNS')), `${name} native transparency preserved`);
  }
  assert(getArmourIconStates(0).every((state) => state === 'empty'), 'zero armour has ten empty states (row owner hides it)');
  const one = getArmourIconStates(1);
  assert(one[0] === 'half' && one.slice(1).every((state) => state === 'empty'), 'one point uses native half state');
  const twenty = getArmourIconStates(20);
  assert(twenty.length === 10 && twenty.every((state) => state === 'full'), 'twenty points uses ten full states');
}

function testRecipes(): void {
  const blocks = new BlockRegistry();
  registerDefaultBlocks(blocks);
  const registry = new RecipeRegistry();
  registerDefaultRecipes(registry, blocks, new ItemIconResolver());

  const helmet = new CraftingGrid(3, 3);
  for (const index of [0, 1, 2, 3, 5]) helmet.setStack(index, new ItemStack('iron_ingot', 'item', 1));
  assert(CraftingMatcher.findMatchingRecipe(helmet, registry)?.output.identity.id === 'iron_helmet', 'normal iron helmet recipe registered');

  const boots = new CraftingGrid(3, 3);
  for (const index of [0, 2, 3, 5]) boots.setStack(index, new ItemStack('leather', 'item', 1));
  assert(CraftingMatcher.findMatchingRecipe(boots, registry)?.output.identity.id === 'leather_boots', 'normal leather boots recipe registered');

  const chain = new CraftingGrid(3, 3);
  for (const index of [0, 1, 2, 3, 5]) chain.setStack(index, new ItemStack(BlockIds.Fire, 'block', 1));
  assert(CraftingMatcher.findMatchingRecipe(chain, registry) === null, 'chain fire-block recipe intentionally omitted');
}

function testPersistenceDeathAndPickup(): void {
  const inventory = new Inventory();
  const equipment = inventory.getEquipment()!;
  equipment.setStack('helmet', armour('iron_helmet', 77));
  equipment.setStack('boots', armour('diamond_boots', 201));
  const encoded = InventorySerializer.serialize(inventory, 2);
  equipment.setStack('chestplate', armour('leather_chestplate'));
  equipment.getStack('chestplate')!.damage = equipment.getStack('chestplate')!.getMaxDurability();
  assert(InventorySerializer.serialize(inventory).armour.chestplate === null, 'persistence never writes broken equipped armour');
  equipment.setStack('chestplate', null);
  const restored = new Inventory();
  InventorySerializer.deserialize(restored, encoded.inventory, encoded.armour);
  assert(restored.getEquipment()?.getStack('helmet')?.damage === 77 && restored.getEquipment()?.getStack('boots')?.damage === 201, 'equipment save/load preserves slots and damage');

  const legacy = new Inventory();
  InventorySerializer.deserialize(legacy, encoded.inventory);
  assert(legacy.getEquipment()?.getStacks().every((stack) => stack === null) === true, 'legacy save without armour loads empty equipment');

  const normalized = new Inventory();
  InventorySerializer.deserialize(normalized, [], {
    helmet: { id: 'iron_boots', type: 'item', count: 1, metadata: 0, damage: 12 },
    chestplate: { id: 'apple', type: 'item', count: 1, metadata: 0, damage: 0 },
    leggings: { id: 'diamond_helmet', type: 'item', count: 1, metadata: 0, damage: 264 },
  });
  assert(normalized.getEquipment()?.getStack('boots')?.damage === 12, 'wrong-slot armour normalized to matching empty slot');
  assert(normalized.getSlots().some((stack) => stack?.identity.id === 'apple'), 'non-armour equipment entry recovered to ordinary inventory');
  assert(normalized.getEquipment()?.getStack('helmet') === null && !normalized.getSlots().some((stack) => stack?.identity.id === 'diamond_helmet'), 'broken saved armour is rejected');

  const blocks = new BlockRegistry();
  registerDefaultBlocks(blocks);
  const chunks = new ChunkManager();
  chunks.getOrCreateChunk(0, 0);
  const behaviours = new BlockBehaviourRegistry();
  const world = new BlockUpdateWorld(chunks, blocks, new LightEngine(chunks, blocks));
  const scene = new THREE.Scene();
  const texture = new THREE.Texture();
  const material = new THREE.MeshBasicMaterial();
  const atlas = { texture, getUvRect: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }) } as never;
  const player = new Player(1.5, 6, 1.5);
  const deathInventory = new Inventory();
  player.setEquipment(deathInventory.getEquipment()!);
  deathInventory.setStack(0, new ItemStack(BlockIds.Dirt, 'block', 3));
  deathInventory.getEquipment()!.setStack('helmet', armour('iron_helmet', 55));
  const manager = new EntityManager({ blockRegistry: blocks, behaviourRegistry: behaviours, blockUpdateWorld: world, chunkManager: chunks, scene, blockAtlas: atlas, itemAtlas: atlas, heldBlockMaterial: material, itemHeldMaterial: material, typeRegistry: createDefaultEntityTypeRegistry(), rng: new JavaRandom(2n), player, playerPosition: player.position });
  const items = new ItemEntityManager(manager, deathInventory, blocks);
  const screen = new DeathScreen(() => {});
  const death = new PlayerDeathController(player, deathInventory, items, new JavaRandom(3n), screen);
  player.attackEntityFrom(DamageSource.environment(), 99);
  death.update();
  death.update();
  manager.tick();
  const drops = manager.getEntitiesInChunk(0, 0).filter((entity): entity is DroppedItemEntity => entity instanceof DroppedItemEntity);
  assert(drops.length === 2, 'ordinary and equipped stacks each drop exactly once on death');
  const helmetDrop = drops.find((drop) => drop.drop.id === 'iron_helmet');
  assert(helmetDrop?.drop.damage === 55 && deathInventory.getEquipment()?.getStack('helmet') === null, 'death drop preserves armour damage and clears equipment');

  player.resetForRespawn(1.5, 6, 1.5);
  for (const drop of drops) {
    drop.setPosition(player.position.x, player.position.y, player.position.z);
    drop.delayBeforeCanPickup = 0;
  }
  items.tickPickups(player);
  const pickedHelmetSlot = deathInventory.getSlots().findIndex((stack) => stack?.identity.id === 'iron_helmet' && stack.damage === 55);
  assert(pickedHelmetSlot >= 0, 'generic pickup restores damaged armour to ordinary inventory');
  InventoryTransferService.shiftClickSlot(deathInventory, pickedHelmetSlot);
  assert(deathInventory.getEquipment()?.getStack('helmet')?.damage === 55, 'picked-up damaged armour can be equipped');

  for (let i = 0; i < 36; i++) deathInventory.setStack(i, new ItemStack(BlockIds.Dirt, 'block', 64));
  const blockedPickup = items.spawnItem(player.position.x, player.position.y, player.position.z, {
    type: 'item', id: 'gold_boots', count: 1, metadata: 0, damage: 5,
  }, 0);
  manager.tick();
  blockedPickup.setPosition(player.position.x, player.position.y, player.position.z);
  blockedPickup.delayBeforeCanPickup = 0;
  items.tickPickups(player);
  assert(!blockedPickup.removed && blockedPickup.drop.damage === 5, 'full inventory leaves dropped damaged armour in the world');

  screen.dispose();
  manager.dispose();
  material.dispose();
  texture.dispose();
}

function main(): void {
  testDefinitions();
  testSlotRestrictionsAndTransfers();
  testAllDamageTransferPaths();
  testProtectionAndDurability();
  testHudAssetsAndStates();
  testRecipes();
  testPersistenceDeathAndPickup();
  console.log('Armour slots, protection, durability, HUD, transfers, drops and persistence validation passed.');
}

main();
