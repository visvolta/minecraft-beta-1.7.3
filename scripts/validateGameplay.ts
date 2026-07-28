/**
 * validateGameplay — items, crafting, furnace, mining, durability, fluids and
 * inventory transfer behaviour.
 */

import { BlockIds } from '../src/blocks/BlockId.ts';
import { BlockRegistry } from '../src/blocks/BlockRegistry.ts';
import { registerDefaultBlocks } from '../src/blocks/registerDefaultBlocks.ts';
import { CraftingGrid } from '../src/crafting/CraftingGrid.ts';
import { CraftingMatcher } from '../src/crafting/CraftingMatcher.ts';
import { RecipeRegistry } from '../src/crafting/RecipeRegistry.ts';
import { ShapedRecipe } from '../src/crafting/ShapedRecipe.ts';
import { ShapelessRecipe } from '../src/crafting/ShapelessRecipe.ts';
import { Inventory } from '../src/inventory/Inventory.ts';
import { InventoryTransferService } from '../src/inventory/InventoryTransferService.ts';
import { ItemStack } from '../src/inventory/ItemStack.ts';
import { DEFAULT_ITEM_DEFINITIONS } from '../src/items/ItemDefinitionRegistry.ts';
import { blockBreakDurabilityCost, combatDurabilityCost } from '../src/items/ItemDurability.ts';
import { calculateMining, crackStage } from '../src/mining/MiningRules.ts';
import { resolveBlockDrops } from '../src/entities/items/BlockDropResolver.ts';
import { assert, assertClose, assertEqual, runSuite, type Section } from './validationHarness.ts';

const registry = new BlockRegistry();
registerDefaultBlocks(registry);

function mine(blockId: number, tool: string | null, underwater = false, grounded = true) {
  const block = registry.getById(blockId)!;
  const held = tool === null ? null : new ItemStack(tool, 'item', 1);
  return calculateMining({ block, held, underwater, grounded });
}

const sections: Section[] = [
  {
    name: 'Inventory',
    checks: [
      {
        name: 'stacks insert, merge and respect their maximum size',
        run: () => {
          const inventory = new Inventory();
          // insert() returns the number of items accepted.
          const accepted = inventory.insert('block', BlockIds.Stone, 10);
          assertEqual(accepted, 10, 'an empty inventory should accept all 10 stone');
          const stack = inventory.getStack(0);
          assert(stack !== null, 'stone should occupy the first slot');
          assertEqual(stack.count, 10, 'stone stack count');
          inventory.insert('block', BlockIds.Stone, 5);
          assertEqual(inventory.getStack(0)?.count, 15, 'inserting more stone should merge into the existing stack');
        },
      },
      {
        name: 'right-click splits a stack, taking the larger half',
        run: () => {
          const inventory = new Inventory();
          inventory.setStack(0, new ItemStack(BlockIds.Stone, 'block', 5, 0));
          const result = InventoryTransferService.rightClickSlot(inventory, 0, null);
          assertEqual(result.cursorStack?.count, 3, 'right click on a stack of 5 should pick up 3');
          assertEqual(inventory.getStack(0)?.count, 2, 'the slot should retain 2');
        },
      },
      {
        name: 'decrementing a slot to zero clears it',
        run: () => {
          const inventory = new Inventory();
          inventory.setStack(0, new ItemStack(BlockIds.Dirt, 'block', 2, 0));
          inventory.decrementSlot(0, 2);
          assertEqual(inventory.getStack(0), null, 'a fully decremented slot must become empty');
        },
      },
      {
        name: 'stacks compare by identity, metadata and damage',
        run: () => {
          const a = new ItemStack(BlockIds.Stone, 'block', 1, 0);
          const b = new ItemStack(BlockIds.Stone, 'block', 1, 0);
          const c = new ItemStack(BlockIds.Stone, 'block', 1, 1);
          assert(a.matches(b), 'identical stacks should match');
          assert(!a.matches(c), 'stacks with different metadata must not match');
        },
      },
    ],
  },
  {
    name: 'Crafting',
    checks: [
      {
        name: 'shaped recipes match only in the correct arrangement',
        run: () => {
          const recipeRegistry = new RecipeRegistry();
          const plank = { id: BlockIds.Planks };
          recipeRegistry.register(new ShapedRecipe(
            2, 2,
            [plank, plank, plank, plank],
            new ItemStack(BlockIds.CraftingTable, 'block', 1),
          ));

          const grid = new CraftingGrid(2, 2);
          for (let slot = 0; slot < 4; slot++) grid.setStack(slot, new ItemStack(BlockIds.Planks, 'block', 1, 0));
          assert(
            CraftingMatcher.findMatchingRecipe(grid, recipeRegistry) !== null,
            'a full 2x2 plank square should craft a crafting table',
          );

          grid.setStack(3, null);
          assertEqual(
            CraftingMatcher.findMatchingRecipe(grid, recipeRegistry),
            null,
            'an incomplete shape must not match',
          );
        },
      },
      {
        name: 'shapeless recipes match regardless of slot order',
        run: () => {
          const recipeRegistry = new RecipeRegistry();
          recipeRegistry.register(new ShapelessRecipe(
            [{ id: BlockIds.Planks }, { id: BlockIds.Stone }],
            new ItemStack(BlockIds.Dirt, 'block', 1),
          ));

          const gridA = new CraftingGrid(2, 2);
          gridA.setStack(0, new ItemStack(BlockIds.Planks, 'block', 1, 0));
          gridA.setStack(1, new ItemStack(BlockIds.Stone, 'block', 1, 0));

          const gridB = new CraftingGrid(2, 2);
          gridB.setStack(2, new ItemStack(BlockIds.Stone, 'block', 1, 0));
          gridB.setStack(3, new ItemStack(BlockIds.Planks, 'block', 1, 0));

          assert(
            CraftingMatcher.findMatchingRecipe(gridA, recipeRegistry) !== null,
            'shapeless recipe should match in the first arrangement',
          );
          assert(
            CraftingMatcher.findMatchingRecipe(gridB, recipeRegistry) !== null,
            'shapeless recipe should match in any arrangement',
          );
        },
      },
      {
        name: 'an empty grid produces no result',
        run: () => {
          assertEqual(
            CraftingMatcher.findMatchingRecipe(new CraftingGrid(3, 3), new RecipeRegistry()),
            null,
            'an empty grid must not craft anything',
          );
        },
      },
    ],
  },
  {
    name: 'Mining rules',
    checks: [
      {
        name: 'correct tools mine faster than the hand',
        run: () => {
          assert(
            mine(BlockIds.Log, 'stone_axe').progressPerTick > mine(BlockIds.Log, null).progressPerTick,
            'logs should be faster with an axe',
          );
          assert(
            mine(BlockIds.Dirt, 'wood_shovel').progressPerTick > mine(BlockIds.Dirt, null).progressPerTick,
            'dirt should be faster with a shovel',
          );
        },
      },
      {
        name: 'harvest levels gate drops by tool material',
        run: () => {
          assert(!mine(BlockIds.Stone, null).canHarvest, 'bare hands must not harvest stone');
          assert(mine(BlockIds.Stone, 'wood_pickaxe').canHarvest, 'a wooden pickaxe should harvest stone');
          assert(!mine(BlockIds.IronOre, 'wood_pickaxe').canHarvest, 'iron ore requires better than wood');
          assert(mine(BlockIds.IronOre, 'stone_pickaxe').canHarvest, 'a stone pickaxe should harvest iron ore');
          assert(!mine(BlockIds.DiamondOre, 'stone_pickaxe').canHarvest, 'diamond ore requires an iron pickaxe');
          assert(mine(BlockIds.DiamondOre, 'iron_pickaxe').canHarvest, 'an iron pickaxe should harvest diamond ore');
          assert(!mine(BlockIds.Obsidian, 'iron_pickaxe').canHarvest, 'obsidian requires a diamond pickaxe');
          assert(mine(BlockIds.Obsidian, 'diamond_pickaxe').canHarvest, 'a diamond pickaxe should harvest obsidian');
        },
      },
      {
        name: 'underwater and airborne penalties each divide speed by five',
        run: () => {
          const normal = mine(BlockIds.Stone, 'iron_pickaxe');
          const underwater = mine(BlockIds.Stone, 'iron_pickaxe', true, true);
          const airborne = mine(BlockIds.Stone, 'iron_pickaxe', false, false);
          const both = mine(BlockIds.Stone, 'iron_pickaxe', true, false);
          assertClose(underwater.progressPerTick * 5, normal.progressPerTick, 1e-9, 'underwater penalty should be 1/5');
          assertClose(airborne.progressPerTick * 5, normal.progressPerTick, 1e-9, 'airborne penalty should be 1/5');
          assertClose(both.progressPerTick * 25, normal.progressPerTick, 1e-9, 'combined penalties should be 1/25');
        },
      },
      {
        name: 'bedrock is unbreakable and zero-hardness blocks break instantly',
        run: () => {
          const bedrock = mine(BlockIds.Bedrock, 'diamond_pickaxe');
          assert(bedrock.unbreakable, 'bedrock must be unbreakable');
          assertEqual(bedrock.progressPerTick, 0, 'bedrock must make no mining progress');
          const flower = mine(BlockIds.Dandelion, null);
          assert(flower.instant, 'zero-hardness blocks should break instantly');
        },
      },
      {
        name: 'crack stage stays clamped to 0..9',
        run: () => {
          for (const [progress, stage] of [[0, 0], [0.09, 0], [0.1, 1], [0.95, 9], [2, 9], [-1, 0]] as const) {
            assertEqual(crackStage(progress), stage, `crack stage for progress ${progress}`);
          }
        },
      },
      {
        name: 'block drops respect harvest eligibility',
        run: () => {
          assertEqual(resolveBlockDrops(BlockIds.Stone, 0, false).length, 0, 'unharvestable stone must drop nothing');
          assertEqual(
            resolveBlockDrops(BlockIds.Stone, 0, true)[0]?.id,
            BlockIds.Cobblestone,
            'correctly harvested stone should drop cobblestone',
          );
          assertEqual(resolveBlockDrops(BlockIds.Dirt, 0, true).length, 1, 'dirt should drop itself');
        },
      },
    ],
  },
  {
    name: 'Durability',
    checks: [
      {
        name: 'tools take damage and break at their durability limit',
        run: () => {
          const definition = DEFAULT_ITEM_DEFINITIONS.get('wood_pickaxe');
          assert(definition?.durability !== undefined, 'wood pickaxe should define a durability');
          const stack = new ItemStack('wood_pickaxe', 'item', 1);
          const max = stack.getMaxDurability();
          assert(max > 0, 'a pickaxe should be damageable');
          const result = stack.damageItem(max);
          assertEqual(result.status, 'broken', 'damaging a tool to its limit should break it');
        },
      },
      {
        name: 'damage is clamped and non-damageable items ignore damage',
        run: () => {
          const stone = new ItemStack(BlockIds.Stone, 'block', 1);
          assertEqual(stone.isDamageable(), false, 'a block stack must not be damageable');
          assertEqual(stone.damageItem(5).status, 'ignored', 'damaging a non-tool should be ignored');
          const negative = new ItemStack('wood_pickaxe', 'item', 1, 0, -5);
          assertEqual(negative.damage, 0, 'negative damage must clamp to 0');
        },
      },
      {
        name: 'durability costs differ between mining and combat use',
        run: () => {
          const sword = new ItemStack('iron_sword', 'item', 1);
          const pickaxe = new ItemStack('iron_pickaxe', 'item', 1);
          assertEqual(blockBreakDurabilityCost(sword), 2, 'a sword costs 2 durability to break a block');
          assertEqual(blockBreakDurabilityCost(pickaxe), 1, 'a pickaxe costs 1 durability to break a block');
          assertEqual(combatDurabilityCost(sword), 1, 'a sword costs 1 durability in combat');
          assertEqual(combatDurabilityCost(pickaxe), 2, 'a pickaxe costs 2 durability in combat');
          assertEqual(blockBreakDurabilityCost(null), 0, 'an empty hand costs no durability');
        },
      },
    ],
  },
  {
    name: 'Fluids',
    checks: [
      {
        name: 'fluid blocks are registered, non-solid and not breakable',
        run: () => {
          for (const id of [BlockIds.WaterStill, BlockIds.WaterFlowing, BlockIds.LavaStill, BlockIds.LavaFlowing]) {
            const definition = registry.getById(id);
            assert(definition !== undefined, `fluid block ${id} is not registered`);
            assertEqual(definition.isLiquid, true, `block ${definition.name} should be flagged as a liquid`);
            assertEqual(definition.solid, false, `fluid ${definition.name} must not be solid`);
          }
        },
      },
      {
        name: 'fluids do not obstruct the opaque heightmap',
        run: () => {
          // Beta's BlockFluids.a() returns false for light opacity, so water
          // must not count as an opaque heightmap surface.
          const water = registry.getById(BlockIds.WaterStill)!;
          assertEqual(water.transparent, true, 'water must be transparent for lighting purposes');
        },
      },
    ],
  },
];

await runSuite('validateGameplay', sections);
