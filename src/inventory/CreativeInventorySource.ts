import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { ItemDefinitionRegistry } from '../items/ItemDefinitionRegistry';
import { ItemStack, getMaxStackSize } from './ItemStack';
import { ItemIconResolver } from './ItemIconResolver';
import { BlockIds } from '../blocks/BlockId';

const SLAB_BLOCK_ID: number = BlockIds.Slab;

/**
 * Blocks that exist in the world but are not player-facing inventory items.
 *
 * Beta's creative-equivalent listings expose the still fluid and the lit
 * redstone torch only; the flowing fluids and the unlit torch are internal
 * states the game switches to on its own.
 */
const CREATIVE_EXCLUDED_BLOCKS: ReadonlySet<number> = new Set<number>([
  // Fluids are world/environment blocks, not player-facing inventory items.
  // Beta obtains them through buckets. The registrations themselves stay
  // intact for world simulation, generation and meshing; only the creative
  // listing is suppressed.
  BlockIds.WaterFlowing,
  BlockIds.WaterStill,
  BlockIds.LavaFlowing,
  BlockIds.LavaStill,
  BlockIds.RedstoneTorchOff,
  // Lit furnace and burning-state blocks are likewise transient.
  BlockIds.FurnaceBurning,
  // Placed-form blocks whose player-facing entry is the item that places
  // them. Listing both produced visible duplicates ("Bed" twice, "Sign"
  // twice, "Wheat" as both crop and seed-grown block).
  BlockIds.Bed,
  BlockIds.SignPost,
  BlockIds.WallSign,
  BlockIds.Crops,
  BlockIds.WoodDoor,
  BlockIds.SpruceDoor,
  BlockIds.BirchDoor,
  BlockIds.IronDoor,
  BlockIds.Reed,
  BlockIds.RedstoneWire,
]);

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

/**
 * Identity of what the player actually sees in a slot: the resolved numeric
 * id plus metadata, independent of whether the stack is stored as a block or
 * as its block-item.
 *
 * Beta places blocks like the lever and trapdoor from an item that shares the
 * block's own id, so enumerating both registries yields the same visible entry
 * twice. Deduplicating on this key at the source removes those pairs without
 * collapsing genuine metadata variants such as the four slab materials.
 */
function visibleKeyOf(stack: ItemStack, items: ItemDefinitionRegistry): string {
  const id = stack.identity.id;
  const numericId = items.get(id)?.numericId ?? (typeof id === 'number' ? id : undefined);
  return `${String(numericId ?? id)}:${stack.metadata}`;
}

export function buildCreativeInventoryEntries(blocks: BlockRegistry, items: ItemDefinitionRegistry): CreativeInventoryEntry[] {
  const entries = new Map<string, CreativeInventoryEntry>();
  const itemIcons = new ItemIconResolver();
  /** Visible (numericId, metadata) identities already claimed by a block. */
  const claimed = new Set<string>();

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
    if (CREATIVE_EXCLUDED_BLOCKS.has(block.id)) continue;

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
        claimed.add(visibleKeyOf(variantStack, items));
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
    claimed.add(visibleKeyOf(stack, items));
  }
  for (const item of items.values()) {
    if (item.creativeVisible !== true) continue;
    const id = item.numericId ?? item.id;
    if (!itemIcons.isKnown(String(id)) && !itemIcons.isKnown(item.id)) continue;
    const stack = new ItemStack(id, 'item', getMaxStackSize({ type: 'item', id }), 0);
    // A block-item duplicates an entry the block registry already produced.
    if (claimed.has(visibleKeyOf(stack, items))) continue;
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
