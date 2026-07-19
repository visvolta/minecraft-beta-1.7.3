import { BlockIds } from '../blocks/BlockId';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { ItemIdentity } from './ItemStack';

export type ItemRenderCategory = 'block_3d' | 'block_special_3d' | 'block_flat' | 'item_flat' | 'unsupported';

/**
 * Authoritatively classifies every item/block identity into its correct Beta 1.7.3 render category.
 */
export function classifyItemRender(
  identity: ItemIdentity,
  blockRegistry: BlockRegistry
): ItemRenderCategory {
  if (identity.type === 'item') {
    return 'item_flat';
  }

  const def = blockRegistry.getById(identity.id as number);
  if (def === undefined) {
    return 'unsupported';
  }

  // Explicitly unsupported complex blocks in this phase (never render chests as fallback cubes)
  if (
    def.id === BlockIds.Chest || 
    def.id === BlockIds.WoodDoor ||
    def.id === BlockIds.SignPost ||
    def.id === BlockIds.WallSign
  ) {
    return 'unsupported';
  }

  // Beta 1.7.3 precise render classification:
  // Render type 'cross' includes plants, flowers, saplings, mushrooms, fire, and crops, which render as flat sprites.
  // Torches, RedstoneTorches, and Ladders are also flat block-texture sprites.
  if (
    def.renderType === 'cross' || 
    def.id === BlockIds.Torch || 
    def.id === BlockIds.RedstoneTorch ||
    def.id === BlockIds.Ladder ||
    def.id === BlockIds.Snow
  ) {
    return 'block_flat';
  }

  return 'block_3d';
}
