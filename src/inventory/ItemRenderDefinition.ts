import type { ItemIdentity } from './ItemStack';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import { classifyItemRender, isBlock3dCategory, isToolCategory } from './ItemRenderClassifier';
import {
  HELD_BLOCK_POSITION_X, HELD_BLOCK_POSITION_Y, HELD_BLOCK_POSITION_Z,
  HELD_BLOCK_ROTATION_X, HELD_BLOCK_ROTATION_Y, HELD_BLOCK_ROTATION_Z,
  HELD_BLOCK_SCALE,
  HELD_FLAT_POSITION_X, HELD_FLAT_POSITION_Y, HELD_FLAT_POSITION_Z,
  HELD_FLAT_ROTATION_X, HELD_FLAT_ROTATION_Y, HELD_FLAT_ROTATION_Z,
  HELD_FLAT_SCALE,
  HELD_TOOL_POSITION_X, HELD_TOOL_POSITION_Y, HELD_TOOL_POSITION_Z,
  HELD_TOOL_ROTATION_X, HELD_TOOL_ROTATION_Y, HELD_TOOL_ROTATION_Z,
  HELD_TOOL_SCALE
} from '../player/PlayerConstants.ts';

export type PresentationKind = 'block' | 'sprite' | 'tool' | 'custom';
export interface Transform { position: readonly [number, number, number]; rotation: readonly [number, number, number]; scale: number }
export interface ItemRenderDefinition { kind: PresentationKind; inventoryIcon?: string; flipHeldHorizontal?: boolean; firstPerson: Transform; material: 'opaque' | 'cutout' | 'transparent' }

const AXE_IDS = new Set<string | number>([
  'wood_axe', 'stone_axe', 'iron_axe', 'diamond_axe', 'gold_axe',
  'wood_axe_shaped', 'stone_axe_shaped', 'iron_axe_shaped', 'diamond_axe_shaped', 'gold_axe_shaped',
  271, 275, 258, 279, 286, '271', '275', '258', '279', '286'
]);

export function presentationFor(identity: ItemIdentity, blocks: BlockRegistry): ItemRenderDefinition {
  const category = classifyItemRender(identity, blocks);
  const flipHeldHorizontal = AXE_IDS.has(identity.id) || (typeof identity.id === 'string' && identity.id.includes('_axe'));

  if (isBlock3dCategory(category)) {
    return {
      kind: 'block',
      firstPerson: {
        position: [HELD_BLOCK_POSITION_X, HELD_BLOCK_POSITION_Y, HELD_BLOCK_POSITION_Z],
        rotation: [HELD_BLOCK_ROTATION_X, HELD_BLOCK_ROTATION_Y, HELD_BLOCK_ROTATION_Z],
        scale: HELD_BLOCK_SCALE
      },
      material: 'opaque'
    };
  }

  if (isToolCategory(category)) {
    return {
      kind: 'tool',
      inventoryIcon: String(identity.id),
      flipHeldHorizontal,
      firstPerson: {
        position: [HELD_TOOL_POSITION_X, HELD_TOOL_POSITION_Y, HELD_TOOL_POSITION_Z],
        rotation: [HELD_TOOL_ROTATION_X, HELD_TOOL_ROTATION_Y, HELD_TOOL_ROTATION_Z],
        scale: HELD_TOOL_SCALE
      },
      material: 'cutout'
    };
  }

  // flatItem (or empty/unsupported/default)
  return {
    kind: 'sprite',
    inventoryIcon: String(identity.id),
    flipHeldHorizontal,
    firstPerson: {
      position: [HELD_FLAT_POSITION_X, HELD_FLAT_POSITION_Y, HELD_FLAT_POSITION_Z],
      rotation: [HELD_FLAT_ROTATION_X, HELD_FLAT_ROTATION_Y, HELD_FLAT_ROTATION_Z],
      scale: HELD_FLAT_SCALE
    },
    material: 'cutout'
  };
}
