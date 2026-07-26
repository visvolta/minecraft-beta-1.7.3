import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { ItemDefinitionRegistry } from '../items/ItemDefinitionRegistry';
import { ItemStack, getMaxStackSize } from './ItemStack';
import { ItemIconResolver } from './ItemIconResolver';
import { BlockIds } from '../blocks/BlockId';

const SLAB_BLOCK_ID: number = BlockIds.Slab;

export type CreativeTabId = 'all' | 'building' | 'decoration' | 'redstone' | 'transportation' | 'misc' | 'tools' | 'combat' | 'food';

export interface CreativeInventoryEntry {
  readonly key: string;
  readonly tab: CreativeTabId | string;
  readonly order: number;
  readonly stack: ItemStack;
}

function keyOf(stack: ItemStack): string {
  return `${stack.identity.type}:${String(stack.identity.id)}:${stack.metadata}:${stack.damage}`;
}

export function buildCreativeInventoryEntries(blocks: BlockRegistry, items: ItemDefinitionRegistry): CreativeInventoryEntry[] {
  const entries = new Map<string, CreativeInventoryEntry>();
  const itemIcons = new ItemIconResolver();

  // Blocks whose metadata selects a material variant. Beta shows each variant
  // as its own creative entry; without this a slab could only ever be taken as
  // metadata 0, which is why wood slabs previously placed as stone.
  const METADATA_VARIANTS: Readonly<Record<number, readonly { readonly metadata: number; readonly name: string }[]>> = {
    [SLAB_BLOCK_ID]: [
      { metadata: 0, name: 'Stone Slab' },
      { metadata: 1, name: 'Sandstone Slab' },
      { metadata: 2, name: 'Wooden Slab' },
      { metadata: 3, name: 'Cobblestone Slab' },
    ],
  };
  for (const block of blocks.values()) {
    if (block.creativeVisible !== true) continue;

    const variants = METADATA_VARIANTS[block.id];
    if (variants !== undefined) {
      for (const variant of variants) {
        const variantStack = new ItemStack(block.id, 'block', 1, variant.metadata);
        const variantEntry: CreativeInventoryEntry = {
          key: keyOf(variantStack),
          tab: block.creativeTab ?? 'building',
          order: (block.creativeOrder ?? block.id) * 16 + variant.metadata,
          stack: variantStack,
        };
        entries.set(variantEntry.key, variantEntry);
      }
      continue;
    }

    const stack = new ItemStack(block.id, 'block', 1, 0);
    const entry: CreativeInventoryEntry = {
      key: keyOf(stack),
      tab: block.creativeTab ?? 'building',
      order: block.creativeOrder ?? block.id,
      stack,
    };
    entries.set(entry.key, entry);
  }
  for (const item of items.values()) {
    if (item.creativeVisible !== true) continue;
    const id = item.numericId ?? item.id;
    if (!itemIcons.isKnown(String(id)) && !itemIcons.isKnown(item.id)) continue;
    const stack = new ItemStack(id, 'item', getMaxStackSize({ type: 'item', id }), 0);
    const entry: CreativeInventoryEntry = {
      key: keyOf(stack),
      tab: item.creativeTab ?? 'misc',
      order: item.creativeOrder ?? item.numericId ?? Number.MAX_SAFE_INTEGER,
      stack,
    };
    entries.set(entry.key, entry);
  }
  return [...entries.values()].sort((a, b) => a.tab.localeCompare(b.tab) || a.order - b.order || a.key.localeCompare(b.key));
}
