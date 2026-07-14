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
}
