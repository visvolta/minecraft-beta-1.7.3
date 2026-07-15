import type { BlockRegistry } from './BlockRegistry';
import { BlockIds } from './BlockId';
import type { TintColor } from './BlockDefinition';

/**
 * Beta-style flat grass tint (~#79C05A), applied to the grayscale
 * grass-top texture at render time. Not baked into any texture or atlas.
 * Replace with biome-colormap sampling in a future stage.
 */
const GRASS_TOP_TINT: TintColor = [0x79 / 255, 0xc0 / 255, 0x5a / 255];

/**
 * Temporary global Beta-style leaf tint (Stage 12C), applied to the
 * grayscale leaf textures at render time — the textures themselves stay
 * grayscale on disk and in the atlas; only the rendered colour changes.
 *
 * Value (0x4ee031) is Beta's own default foliage-colour multiplier,
 * verified directly in mc-dev's MobSpawnerBase constructor
 * (`q = 0x4ee031;`) — the same per-biome-overridable field real Beta
 * uses for its biome-tinted leaf colour (biomes that don't explicitly
 * override it, e.g. Seasonal Forest/Savanna/Shrubland/Desert/Plains,
 * render leaves with exactly this colour). Using one fixed global value
 * for every biome (rather than sampling per-biome like Beta's own
 * colormap) is this stage's explicitly scoped simplification — the
 * per-face BlockTints mechanism used here is the same one grass already
 * uses, so swapping this constant for real biome-sampled tinting later
 * requires no mesher/material changes, only a different tint *source*.
 */
const LEAF_TINT: TintColor = [0x4e / 255, 0xe0 / 255, 0x31 / 255];

/**
 * Registers the initial Beta 1.7.3 blocks required for this stage.
 */
export function registerDefaultBlocks(registry: BlockRegistry): void {
  registry.register({
    id: BlockIds.Air,
    name: 'air',
    displayName: 'Air',
    solid: false,
    transparent: true,
    replaceable: true,
    textures: {},
  });

  registry.register({
    id: BlockIds.Stone,
    name: 'stone',
    displayName: 'Stone',
    solid: true,
    transparent: false,
    replaceable: false,
    textures: { all: 'stone' },
  });

  registry.register({
    id: BlockIds.Grass,
    name: 'grass',
    displayName: 'Grass Block',
    solid: true,
    transparent: false,
    replaceable: false,
    textures: {
      top: 'grass_top',
      bottom: 'dirt',
      side: 'grass_side',
    },
    tints: {
      // Only the top face uses the grayscale texture; the side texture
      // already has its green fringe baked in, matching Beta 1.7.3.
      top: GRASS_TOP_TINT,
    },
  });

  registry.register({
    id: BlockIds.Dirt,
    name: 'dirt',
    displayName: 'Dirt',
    solid: true,
    transparent: false,
    replaceable: false,
    textures: { all: 'dirt' },
  });

  registry.register({
    id: BlockIds.Cobblestone,
    name: 'cobblestone',
    displayName: 'Cobblestone',
    solid: true,
    transparent: false,
    replaceable: false,
    textures: { all: 'cobblestone' },
  });

  registry.register({
    id: BlockIds.Bedrock,
    name: 'bedrock',
    displayName: 'Bedrock',
    solid: true,
    transparent: false,
    replaceable: false,
    textures: { all: 'bedrock' },
  });

  registry.register({
    id: BlockIds.Sand,
    name: 'sand',
    displayName: 'Sand',
    solid: true,
    transparent: false,
    replaceable: false,
    textures: { all: 'sand' },
  });

  registry.register({
    id: BlockIds.Gravel,
    name: 'gravel',
    displayName: 'Gravel',
    solid: true,
    transparent: false,
    replaceable: false,
    textures: { all: 'gravel' },
  });

  registry.register({
    id: BlockIds.Clay,
    name: 'clay',
    displayName: 'Clay',
    // Registered because the texture is supplied; Stage 12A's terrain
    // generation never places Clay (no clay-patch logic implemented yet).
    solid: true,
    transparent: false,
    replaceable: false,
    textures: { all: 'clay' },
  });

  registry.register({
    id: BlockIds.Podzol,
    name: 'podzol',
    displayName: 'Podzol',
    // Registered so the texture/atlas pipeline can use it later; never
    // generated naturally by Stage 12A terrain (real Beta 1.7.3 had no
    // Podzol block at all — see BlockIds.Podzol's doc comment for why
    // this id is a temporary, non-Beta-compatible placeholder).
    solid: true,
    transparent: false,
    replaceable: false,
    textures: {
      top: 'podzol_top',
      bottom: 'dirt',
      side: 'podzol_side',
    },
  });

  registry.register({
    id: BlockIds.Water,
    name: 'water',
    displayName: 'Water',
    // Non-solid and transparent: correct block *data* (players won't
    // collide with it like a wall, and it won't cull neighbouring faces
    // as if opaque). However, the current ChunkMesher only emits geometry
    // for solid-opaque blocks, so water will not yet be visually rendered
    // — this is a deliberately deferred rendering limitation (see the
    // Stage 12A summary), not a silent omission from world data. No flow
    // simulation or animation is implemented; water is a static fill.
    solid: false,
    transparent: true,
    replaceable: false,
    textures: { all: 'water' },
  });

  registry.register({
    id: BlockIds.Lava,
    name: 'lava',
    displayName: 'Lava',
    // Mirrors Water's current deliberate deferral (Stage 12A/12D): real
    // Beta lava is solid-for-collision and animated/flowing, but this
    // project has no fluid simulation yet. Registered as non-solid so
    // it doesn't block player movement like a wall (a nearer-term
    // improvement than leaving cave lava as impassible stone-like
    // collision would be), transparent so ChunkMesher's fluid-mesh pass
    // (see Stage 12D's water meshing, generalized for Lava in Stage
    // 12B) renders it with culled faces instead of as opaque terrain.
    solid: false,
    transparent: true,
    replaceable: false,
    textures: { all: 'lava' },
  });

  registry.register({
    id: BlockIds.Log,
    name: 'log',
    displayName: 'Oak Log',
    // Real Beta 1.7.3 Log (id 17) is solid and opaque, matching the
    // opaque terrain culling pass used here — no cutout/transparency.
    solid: true,
    transparent: false,
    replaceable: false,
    textures: {
      top: 'oak_top',
      bottom: 'oak_top',
      side: 'oak_side',
    },
  });

  registry.register({
    id: BlockIds.Leaves,
    name: 'leaves',
    displayName: 'Oak Leaves',
    // Leaves are solid for face-culling purposes (matching real Beta:
    // adjacent leaf blocks hide each other's shared face, and leaves
    // are opaque-for-lighting-and-collision blocks, not see-through
    // like water/glass) but render via the cutout pass (binary alpha
    // from the supplied grayscale texture), not the normal opaque pass
    // — see BlockDefinition.cutout's doc comment. transparent stays
    // false since "transparent" in this project's existing vocabulary
    // means "does not occlude/cull like a wall" (fluids), which does
    // not describe leaves; `cutout` is the correct, separate signal for
    // "render as alpha-tested cutout geometry".
    solid: true,
    transparent: false,
    cutout: true,
    replaceable: false,
    textures: { all: 'oak_leaves' },
    // Leaves are supplied fully grayscale (see oak_leaves.png) and must
    // never be recoloured on disk or baked into the atlas — this tint is
    // applied only at render time via the same per-face BlockTints
    // mechanism grass already uses. All three faces need an explicit
    // entry (BlockTints has no "all" shorthand) since every face of a
    // leaf block uses the single grayscale texture and needs tinting.
    tints: {
      top: LEAF_TINT,
      bottom: LEAF_TINT,
      side: LEAF_TINT,
    },
  });

  registry.register({
    id: BlockIds.SpruceLog,
    name: 'spruce_log',
    displayName: 'Spruce Log',
    // TEMPORARY, project-internal id — see BlockIds.SpruceLog's doc
    // comment (real Beta reuses Log id 17 with metadata for species).
    solid: true,
    transparent: false,
    replaceable: false,
    textures: {
      top: 'spruce_top',
      bottom: 'spruce_top',
      side: 'spruce_side',
    },
  });

  registry.register({
    id: BlockIds.SpruceLeaves,
    name: 'spruce_leaves',
    displayName: 'Spruce Leaves',
    // TEMPORARY, project-internal id — see BlockIds.SpruceLeaves's doc
    // comment. Same cutout/tint treatment as Leaves (Oak); Beta's real
    // spruce leaves are also foliage-tinted, not a fixed hardcoded
    // colour like some later Minecraft versions eventually made them.
    solid: true,
    transparent: false,
    cutout: true,
    replaceable: false,
    textures: { all: 'spruce_leaves' },
    tints: {
      top: LEAF_TINT,
      bottom: LEAF_TINT,
      side: LEAF_TINT,
    },
  });
}
