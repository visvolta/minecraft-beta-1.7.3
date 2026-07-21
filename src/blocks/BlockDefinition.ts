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
  front?: string;
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
  front?: TintColor;
}

export type BlockRenderType = 'opaque' | 'cutout' | 'leaves' | 'cross' | 'cactus' | 'fluid' | 'snow' | 'ice' | 'chest';

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
  /** Rendering category of the block, used for chunk meshing and collision types. */
  readonly renderType?: BlockRenderType;
  /** How much light this block blocks, from 0 to 15. Defaults to 15 if solid, or 0 if transparent. */
  readonly lightOpacity?: number;
  /** How much light this block emits, from 0 to 15. Defaults to 0. */
  readonly lightEmission?: number;
  /**
   * Beta Material-style precipitation blocker. True for materials that
   * stop rain/snow when Chunk.precipitationHeightMap scans downward:
   * solid blocks and liquids, including transparent solid materials such
   * as glass/leaves/ice. Do not infer this from render transparency.
   */
  readonly blocksWeather?: boolean;
  /** Beta Material-style liquid flag, used by weather blocking and future fluids. */
  readonly isLiquid?: boolean;
  readonly receivesAmbientOcclusion?: boolean;
  readonly contributesAmbientOcclusion?: boolean;
  /**
   * True for blocks that render via a binary alpha-test ("cutout") pass
   * instead of the normal opaque pass or the blended fluid pass — every
   * pixel is either fully opaque or fully transparent (no blending), and
   * unlike fluids, cutout blocks DO cull faces against each other and
   * other solid/cutout neighbours (matching Beta's real leaf behaviour:
   * `solid: true` is what drives face culling; `cutout` only changes
   * which material/mesh pass a block's faces are emitted into).
   * Stage 12C's only cutout blocks are Leaves and SpruceLeaves. Defaults
   * to false (omitted) for every other block, so this is purely additive
   * and doesn't change any existing block's behaviour.
   */
  readonly cutout?: boolean;
  /** Beta 1.7.3 hardness value. Unbreakable blocks (like Bedrock) are -1.0. Instant break blocks are 0.0. */
  readonly hardness?: number;
  /** Beta block explosion resistance consumed by shared explosion sources. */
  readonly explosionResistance?: number;
  /** True if the block is harvestable with an empty hand (e.g., dirt, sand, wood log/planks). */
  readonly harvestableByHand?: boolean;
}
