import type { BlockDefinition } from './BlockDefinition';
import { FaceDirection, type BlockFace } from './BlockFace';

/**
 * Resolves which texture name a face of a block should sample.
 * Falls back to `textures.all` when no face-specific entry exists.
 * Returns undefined if the block defines no texture at all (e.g. Air).
 */
export function resolveBlockTexture(
  definition: BlockDefinition,
  face: BlockFace,
): string | undefined {
  if (face === 'front') {
    return definition.textures.front ?? definition.textures.side ?? definition.textures.all;
  }
  if (face === 'back') {
    return definition.textures.side ?? definition.textures.all; // no explicit back texture config usually, but could add it later
  }
  return definition.textures[face] ?? definition.textures.all;
}

/**
 * Maps an absolute world face direction to a semantic block face (front/side/top/bottom) 
 * given the block's placement metadata (2=North, 3=South, 4=West, 5=East).
 * If no metadata is provided or block doesn't use facing, defaults to South facing (+Z).
 */
export function getSemanticFace(dir: FaceDirection, metadata = 3): BlockFace {
  if (dir === FaceDirection.TOP) return 'top';
  if (dir === FaceDirection.BOTTOM) return 'bottom';

  // For Crafting tables, which use metadata=0 usually, we hardcode its Beta appearance if needed,
  // but usually it's front on North/South, side on East/West.
  // Actually, we can treat metadata=0 as default South facing.
  const facing = metadata === 0 ? 3 : metadata;

  if (facing === 2) { // Facing North (-Z)
    if (dir === FaceDirection.NORTH) return 'front';
    if (dir === FaceDirection.SOUTH) return 'back';
    return 'side';
  } else if (facing === 3) { // Facing South (+Z)
    if (dir === FaceDirection.SOUTH) return 'front';
    if (dir === FaceDirection.NORTH) return 'back';
    return 'side';
  } else if (facing === 4) { // Facing West (-X)
    if (dir === FaceDirection.WEST) return 'front';
    if (dir === FaceDirection.EAST) return 'back';
    return 'side';
  } else if (facing === 5) { // Facing East (+X)
    if (dir === FaceDirection.EAST) return 'front';
    if (dir === FaceDirection.WEST) return 'back';
    return 'side';
  }

  return 'side';
}
