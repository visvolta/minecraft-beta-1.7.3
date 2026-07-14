import type { BlockId } from './BlockId';

/**
 * Texture keys resolved against the atlas by name (e.g. "stone", "grass_top").
 * "all" is used for any face without a more specific entry.
 */
export interface BlockTextures {
  all?: string;
  top?: string;
  bottom?: string;
  side?: string;
}

/** Normalized RGB tint multiplier, each channel in [0, 1]. */
export type TintColor = readonly [number, number, number];

/**
 * Per-face tint multipliers applied on top of the sampled atlas texture.
 * A face without an entry here is rendered untinted (multiplied by white).
 *
 * This is a temporary, fixed-colour stand-in for future biome-colormap
 * sampling: only the tint *source* is expected to change later, not the
 * mesher, material, or atlas.
 */
export interface BlockTints {
  top?: TintColor;
  bottom?: TintColor;
  side?: TintColor;
}

/**
 * Immutable block data. Behaviour lives in other systems, not here.
 */
export interface BlockDefinition {
  readonly id: BlockId;
  /** Internal name, e.g. "stone". */
  readonly name: string;
  /** Human-readable label, e.g. "Stone". */
  readonly displayName: string;
  readonly solid: boolean;
  readonly transparent: boolean;
  readonly replaceable: boolean;
  readonly textures: BlockTextures;
  readonly tints?: BlockTints;
}
