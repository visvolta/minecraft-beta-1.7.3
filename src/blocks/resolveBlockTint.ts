import type { BlockDefinition, TintColor } from './BlockDefinition';
import type { BlockFace } from './BlockFace';

/** Untinted multiplier — leaves the sampled texture colour unchanged. */
export const WHITE_TINT: TintColor = [1, 1, 1];

/**
 * Resolves the tint multiplier for a face of a block.
 * Returns WHITE_TINT when the block defines no tint for that face.
 */
export function resolveBlockTint(
  definition: BlockDefinition,
  face: BlockFace,
): TintColor {
  if (face === 'front') {
    return definition.tints?.front ?? definition.tints?.side ?? WHITE_TINT;
  }
  if (face === 'back') {
    return definition.tints?.side ?? WHITE_TINT;
  }
  return definition.tints?.[face as 'top' | 'bottom' | 'side' | 'front'] ?? WHITE_TINT;
}
