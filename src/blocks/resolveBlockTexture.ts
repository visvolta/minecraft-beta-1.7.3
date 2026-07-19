import type { BlockDefinition } from './BlockDefinition';
import type { BlockFace } from './BlockFace';

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
  return definition.textures[face] ?? definition.textures.all;
}
