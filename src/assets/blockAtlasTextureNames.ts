import type { BlockRegistry } from '../blocks/BlockRegistry';

/**
 * Texture names the mesher selects at mesh time (from metadata, neighbours or
 * per-half model choices) rather than through a block definition's own texture
 * entries. They are unreachable from a scan of the registry, so they must be
 * listed explicitly or the atlas silently omits them and the mesher falls back
 * to `missing_texture`.
 */
export const MESH_TIME_TEXTURE_NAMES: readonly string[] = [
  // Snow-covered grass side texture (Beta texture 68), chosen by ChunkMesher
  // when a Grass block has Snow above it.
  'grass_side_snowed',

  // Fern is TallGrass metadata 2 (Beta BlockTallGrass). The greyscale sheet is
  // tinted by the grass colorizer at render time.
  'fern',

  // Bed faces are chosen per half at mesh time.
  'bed_head_top',
  'bed_head_side',
  'bed_head_end',
  'bed_feet_top',
  'bed_feet_side',
  'bed_feet_end',

  // Slab base materials (Stone and Sandstone) selected by metadata.
  'stone_slab_top',
  'stone_slab_side',
  'sandstone_top',
  'sandstone_normal',

  // Rail variants chosen per metadata: the curved sheet and the powered /
  // active states are never named by a block definition.
  'rail_normal',
  'rail_normal_turned',
  'rail_golden',
  'rail_golden_powered',
  'rail_detector',

  // Door upper halves.
  'door_wood_upper',
  'door_iron_upper',
  'door_spruce_upper',
  'door_birch_upper',

  // Redstone wire shapes and overlays (Beta 1.7.3).
  'redstone_dust_cross',
  'redstone_dust_line',
  'redstone_dust_cross_overlay',
  'redstone_dust_line_overlay',
];

/** Number of block-destruction stage textures (destroy_stage_0..9). */
export const DESTROY_STAGE_COUNT = 10;

/**
 * Authoritative missing-texture fallback region in the atlas. Deliberately not
 * the first atlas region so an accidental zeroed UV rect is distinguishable
 * from a genuine fallback.
 */
export const MISSING_TEXTURE_NAME = 'missing_texture';

/**
 * Every distinct block texture name that must be packed into the atlas: the
 * names reachable from block definitions plus the mesh-time-only names above.
 *
 * Pure and browser-API free so validation can call it headlessly and assert the
 * atlas covers exactly what the mesher will ask for.
 */
export function collectBlockAtlasTextureNames(blockRegistry: BlockRegistry): Set<string> {
  const textureNames = new Set<string>();

  for (const definition of blockRegistry.values()) {
    const { all, top, bottom, side, front } = definition.textures;
    for (const name of [all, top, bottom, side, front]) {
      if (name !== undefined) textureNames.add(name);
    }
  }

  for (const name of MESH_TIME_TEXTURE_NAMES) textureNames.add(name);

  for (let stage = 0; stage < DESTROY_STAGE_COUNT; stage++) {
    textureNames.add(`destroy_stage_${stage}`);
  }

  textureNames.add(MISSING_TEXTURE_NAME);

  return textureNames;
}
