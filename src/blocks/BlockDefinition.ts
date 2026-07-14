import type { BlockId } from './BlockId';

/**
 * Placeholder texture keys for a future atlas / loader.
 * No files are loaded in this stage.
 */
export interface BlockTextures {
  all?: string;
  top?: string;
  bottom?: string;
  side?: string;
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
}
