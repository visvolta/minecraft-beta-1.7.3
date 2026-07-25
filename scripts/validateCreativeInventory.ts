import { BlockIds } from '../src/blocks/BlockId.ts';
import { BlockRegistry } from '../src/blocks/BlockRegistry.ts';
import { registerDefaultBlocks } from '../src/blocks/registerDefaultBlocks.ts';
import { DEFAULT_ITEM_DEFINITIONS } from '../src/items/ItemDefinitionRegistry.ts';
import { buildCreativeInventoryEntries } from '../src/inventory/CreativeInventorySource.ts';
import { getMaxStackSize } from '../src/inventory/ItemStack.ts';
import { assert, assertEqual, runSuite, type TestCase } from './persistence2Harness.ts';

const tests: TestCase[] = [
  {
    name: 'creative inventory source contains visible block and item entries without duplicates',
    run: async () => {
      const blocks = new BlockRegistry();
      registerDefaultBlocks(blocks);
      const entries = buildCreativeInventoryEntries(blocks, DEFAULT_ITEM_DEFINITIONS);
      assert(entries.length > 0, 'creative inventory has entries');
      assertEqual(new Set(entries.map((entry) => entry.key)).size, entries.length, 'creative entries are unique by stack identity');
      assert(entries.some((entry) => entry.stack.identity.type === 'block' && entry.stack.identity.id === BlockIds.Stone), 'stone block is present');
      assert(entries.some((entry) => entry.stack.identity.type === 'item' && entry.stack.identity.id === 'arrow'), 'arrow item is present by item id');
      assert(entries.some((entry) => entry.tab === 'food'), 'food tab entries are present');
      assert(entries.some((entry) => entry.tab === 'building'), 'building tab entries are present');
      for (const entry of entries) {
        const expectedCount = entry.stack.identity.type === 'block' ? 1 : getMaxStackSize(entry.stack.identity);
        assert(entry.stack.count === expectedCount, `${entry.key} uses current creative source stack count`);
        assert(entry.order >= 0, `${entry.key} has non-negative sort order`);
      }
    },
  },
  {
    name: 'creative inventory ordering is deterministic by tab, order and key',
    run: async () => {
      const blocks = new BlockRegistry();
      registerDefaultBlocks(blocks);
      const first = buildCreativeInventoryEntries(blocks, DEFAULT_ITEM_DEFINITIONS).map((entry) => entry.key).join('|');
      const second = buildCreativeInventoryEntries(blocks, DEFAULT_ITEM_DEFINITIONS).map((entry) => entry.key).join('|');
      assertEqual(first, second, 'creative entries order is deterministic');
    },
  },
];

await runSuite('validateCreativeInventory', tests);
