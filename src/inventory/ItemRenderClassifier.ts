import { BlockIds } from '../blocks/BlockId';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { ItemIdentity } from './ItemStack';

export type ItemRenderCategory =
  | 'block3d'
  | 'flatItem'
  | 'tool'
  | 'empty'
  | 'unsupported'
  | 'block_3d'
  | 'block_special_3d'
  | 'block_flat'
  | 'item_flat';

const TOOL_NAMES = new Set([
  'wood_pickaxe', 'stone_pickaxe', 'iron_pickaxe', 'diamond_pickaxe', 'gold_pickaxe',
  'wood_axe', 'stone_axe', 'iron_axe', 'diamond_axe', 'gold_axe',
  'wood_shovel', 'stone_shovel', 'iron_shovel', 'diamond_shovel', 'gold_shovel',
  'wood_sword', 'stone_sword', 'iron_sword', 'diamond_sword', 'gold_sword',
  'wood_hoe', 'stone_hoe', 'iron_hoe', 'diamond_hoe', 'gold_hoe',
  'bow_standby', 'bow_pulling_0', 'bow_pulling_1', 'bow_pulling_2', 'arrow',
  'fishing_rod_uncast', 'fishing_rod_cast', 'flint_and_steel', 'shears',
  '268', '269', '270', '271', '290', // wood tools
  '272', '273', '274', '275', '291', // stone tools
  '267', '256', '257', '258', '292', // iron tools
  '276', '277', '278', '279', '293', // diamond tools
  '283', '284', '285', '286', '294', // gold tools
  '259', '359', '261', '346'
]);

/**
 * Authoritatively classifies every item/block identity into its correct Beta 1.7.3 render category:
 * block3d (and block_3d alias), flatItem (and block_flat/item_flat aliases), tool, empty, or unsupported.
 */
export function classifyItemRender(
  identity: ItemIdentity,
  blockRegistry: BlockRegistry
): ItemRenderCategory {
  if (identity.id === 0 || identity.id === '0' || identity.id === BlockIds.Air) {
    return 'empty';
  }

  const idStr = String(identity.id);
  if (
    TOOL_NAMES.has(idStr) ||
    idStr.includes('pickaxe') ||
    idStr.includes('axe') ||
    idStr.includes('shovel') ||
    idStr.includes('sword') ||
    idStr.includes('hoe')
  ) {
    return 'tool';
  }

  if (identity.type === 'item') {
    return 'flatItem';
  }

  const def = blockRegistry.getById(identity.id as number);
  if (def === undefined) {
    return 'unsupported';
  }

  if (def.id === BlockIds.Air) {
    return 'empty';
  }

  // Explicitly unsupported complex blocks in this phase (never render spawners as fallback cubes)
  if (def.id === BlockIds.Spawner) {
    return 'unsupported';
  }

  if (def.id === BlockIds.Chest) {
    return 'block_3d';
  }

  // Beta 1.7.3 precise render classification:
  if (
    def.renderType === 'cross' ||
    def.renderType === 'cactus' ||
    def.renderType === 'snow' ||
    def.id === BlockIds.Torch ||
    def.id === BlockIds.RedstoneTorch ||
    def.id === BlockIds.Ladder ||
    def.id === BlockIds.WoodDoor ||
    def.id === BlockIds.SignPost ||
    def.id === BlockIds.WallSign ||
    def.id === BlockIds.StoneButton ||
    def.id === BlockIds.Lever ||
    def.id === BlockIds.StonePressurePlate ||
    def.id === 66 || // Rail
    def.id === 27 || // PoweredRail
    def.id === 28 || // DetectorRail
    (!def.solid && def.renderType !== 'ice')
  ) {
    return 'flatItem';
  }

  return 'block3d';
}

export function isBlock3dCategory(cat: ItemRenderCategory): boolean {
  return cat === 'block3d' || cat === 'block_3d';
}

export function isFlatItemCategory(cat: ItemRenderCategory): boolean {
  return cat === 'flatItem' || cat === 'block_flat' || cat === 'item_flat';
}

export function isToolCategory(cat: ItemRenderCategory): boolean {
  return cat === 'tool';
}
