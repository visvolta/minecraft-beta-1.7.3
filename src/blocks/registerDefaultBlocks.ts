import type { BlockRegistry } from './BlockRegistry';
import { BlockIds } from './BlockId';
import type { BlockDefinition, BlockLightEmission, TintColor } from './BlockDefinition';
import { DEFAULT_BLOCK_SOUND, type BlockSoundDefinition } from '../audio/BlockSoundMaterial';
import { BETA_BLOCK_SOUNDS } from '../audio/betaBlockSounds';


const BETA_EXPLOSION_RESISTANCE: Readonly<Record<string, number>> = {
  sandstone: 4, lapis_block: 5, gold_block: 10, iron_block: 10, diamond_block: 10,
  brick_block: 10, glowstone: 1.5, soul_sand: 2.5, cobblestone_stairs: 10, bed: 1,
  air: 0, stone: 6, grass: 0.6, dirt: 0.5, cobblestone: 6,
  bedrock: 3_600_000, sand: 0.5, gravel: 0.6, clay: 0.6,
  flowing_water: 100, still_water: 100, flowing_lava: 100, still_lava: 100,
  obsidian: 1_200, glass: 0.3, log: 2, planks: 3, leaves: 0.2,
};


/**
 * Beta-authentic block sound, from the transcribed `setStepSound` table.
 *
 * Falls back to the stone default only for ids Beta itself does not define
 * (e.g. Air). The previous name-substring heuristic guessed wrongly for many
 * blocks — "dandelion" and "rose" contain none of the plant keywords, so
 * flowers broke with stone sounds.
 */
function defaultSoundFor(definition: BlockDefinition): BlockSoundDefinition {
  const beta = BETA_BLOCK_SOUNDS[definition.id];
  if (beta !== undefined) return { volume: 1, pitch: 1, ...beta };
  return DEFAULT_BLOCK_SOUND;
}

function registerBlock(registry: BlockRegistry, definition: BlockDefinition): void {
  registry.register({
    ...definition,
    explosionResistance: definition.explosionResistance ?? BETA_EXPLOSION_RESISTANCE[definition.name] ?? (definition.solid ? 1 : 0),
    creativeVisible: definition.creativeVisible ?? (definition.id !== BlockIds.Air && definition.id < 249),
    creativeTab: definition.creativeTab ?? 'building',
    creativeOrder: definition.creativeOrder ?? definition.id,
    sound: definition.sound ?? defaultSoundFor(definition),
  });
}

/**
 * Beta-style flat grass tint (~#79C05A), applied to the grayscale
 * grass-top texture at render time. Not baked into any texture or atlas.
 */
const GRASS_TOP_TINT: TintColor = [0x79 / 255, 0xc0 / 255, 0x5a / 255];

/**
 * Temporary global Beta-style leaf tint (Stage 12C), applied to the
 * grayscale leaf textures at render time — the textures themselves stay
 * grayscale on disk and in the atlas; only the rendered colour changes.
 */
const LEAF_TINT: TintColor = [0x4e / 255, 0xe0 / 255, 0x31 / 255];

/**
 * Registers the initial Beta 1.7.3 blocks required for this stage.
 */
/**
 * Visual light colours (project extension, NOT Beta).
 *
 * Beta has a single grayscale block-light channel; these tints are additive
 * presentation only and never change a block's gameplay light LEVEL. The
 * registry is the sole authority, so a mod can register any RGB it likes with
 * no engine change. Channels are 0..1 and are multiplied by the Beta level.
 */
const LIGHT_COLOR_TORCH = [1.0, 0.82, 0.55] as const;
const LIGHT_COLOR_REDSTONE = [1.0, 0.15, 0.10] as const;
const LIGHT_COLOR_GLOWSTONE = [1.0, 0.90, 0.62] as const;
const LIGHT_COLOR_LAVA = [1.0, 0.55, 0.20] as const;
const LIGHT_COLOR_FIRE = [1.0, 0.65, 0.30] as const;
const LIGHT_COLOR_PORTAL = [0.65, 0.30, 1.0] as const;
const LIGHT_COLOR_FURNACE = [1.0, 0.78, 0.45] as const;

export function registerDefaultBlocks(registry: BlockRegistry): void {
  registerBlock(registry, {
    id: BlockIds.Air,
    name: 'air',
    displayName: 'Air',
    solid: false,
    transparent: true,
    replaceable: true,
    blocksWeather: false,
    textures: {},
    renderType: 'fluid',
  });

  registerBlock(registry, {
    id: BlockIds.Stone,
    name: 'stone',
    displayName: 'Stone',
    solid: true,
    transparent: false,
    replaceable: false,
    blocksWeather: true,
    textures: { all: 'stone' },
    renderType: 'opaque',
  });

  registerBlock(registry, {
    id: BlockIds.Grass,
    name: 'grass',
    displayName: 'Grass Block',
    solid: true,
    transparent: false,
    replaceable: false,
    blocksWeather: true,
    textures: {
      top: 'grass_top',
      bottom: 'dirt',
      side: 'grass_side',
    },
    tints: {
      top: GRASS_TOP_TINT,
    },
    renderType: 'opaque',
  });

  registerBlock(registry, {
    id: BlockIds.Dirt,
    name: 'dirt',
    displayName: 'Dirt',
    solid: true,
    transparent: false,
    replaceable: false,
    blocksWeather: true,
    textures: { all: 'dirt' },
    renderType: 'opaque',
  });

  registerBlock(registry, {
    id: BlockIds.Cobblestone,
    name: 'cobblestone',
    displayName: 'Cobblestone',
    solid: true,
    transparent: false,
    replaceable: false,
    blocksWeather: true,
    textures: { all: 'cobblestone' },
    renderType: 'opaque',
  });

  registerBlock(registry, {
    id: BlockIds.Bedrock,
    name: 'bedrock',
    displayName: 'Bedrock',
    solid: true,
    transparent: false,
    replaceable: false,
    blocksWeather: true,
    textures: { all: 'bedrock' },
    renderType: 'opaque',
  });

  registerBlock(registry, {
    id: BlockIds.Sand,
    name: 'sand',
    displayName: 'Sand',
    solid: true,
    transparent: false,
    replaceable: false,
    blocksWeather: true,
    textures: { all: 'sand' },
    renderType: 'opaque',
  });

  registerBlock(registry, {
    id: BlockIds.Gravel,
    name: 'gravel',
    displayName: 'Gravel',
    solid: true,
    transparent: false,
    replaceable: false,
    blocksWeather: true,
    textures: { all: 'gravel' },
    renderType: 'opaque',
  });

  registerBlock(registry, {
    id: BlockIds.Clay,
    name: 'clay',
    displayName: 'Clay',
    solid: true,
    transparent: false,
    replaceable: false,
    blocksWeather: true,
    textures: { all: 'clay' },
    renderType: 'opaque',
  });

  registerBlock(registry, {
    id: BlockIds.Podzol,
    name: 'podzol',
    displayName: 'Podzol',
    solid: true,
    transparent: false,
    replaceable: false,
    blocksWeather: true,
    textures: {
      top: 'podzol_top',
      bottom: 'dirt',
      side: 'podzol_side',
    },
    renderType: 'opaque',
  });

  registerBlock(registry, {
    id: BlockIds.CoarseDirt,
    name: 'coarse_dirt',
    displayName: 'Coarse Dirt',
    solid: true,
    transparent: false,
    replaceable: false,
    blocksWeather: true,
    textures: { all: 'coarse_dirt' },
    // Without an explicit renderType the mesher's isOpaqueMeshBlock() check
    // fails and the block is skipped by every pass, so it generates in the
    // world but renders as a hole. Coarse dirt is a full opaque cube.
    renderType: 'opaque',
  });

  registerBlock(registry, {
    id: BlockIds.WaterFlowing,
    name: 'flowing_water',
    displayName: 'Flowing Water',
    solid: false,
    transparent: true,
    replaceable: true,
    blocksWeather: true,
    isLiquid: true,
    isTargetable:false,
    isBreakable:false,
    textures: { all: 'water' },
    renderType: 'fluid',
    lightOpacity: 3,
  });

  registerBlock(registry, {
    id: BlockIds.WaterStill,
    name: 'water',
    displayName: 'Water',
    solid: false,
    transparent: true,
    replaceable: true,
    blocksWeather: true,
    isLiquid: true,
    isTargetable:false,
    isBreakable:false,
    textures: { all: 'water' },
    renderType: 'fluid',
    lightOpacity: 3,
  });

  registerBlock(registry, {
    id: BlockIds.LavaFlowing,
    name: 'flowing_lava',
    displayName: 'Flowing Lava',
    solid: false,
    transparent: true,
    replaceable: true,
    blocksWeather: true,
    isLiquid: true,
    isTargetable:false,
    isBreakable:false,
    textures: { all: 'lava' },
    renderType: 'fluid',
    lightOpacity: 3,
    // Beta level 15; the tint is the project's colour extension.
    lightEmission: { level: 15, color: LIGHT_COLOR_LAVA },
  });

  registerBlock(registry, {
    id: BlockIds.Log,
    name: 'log',
    displayName: 'Oak Log',
    solid: true,
    transparent: false,
    replaceable: false,
    blocksWeather: true,
    textures: {
      top: 'oak_top',
      bottom: 'oak_top',
      side: 'oak_side',
    },
    renderType: 'opaque',
  });

  registerBlock(registry, {
    id: BlockIds.Leaves,
    name: 'leaves',
    displayName: 'Oak Leaves',
    solid: true,
    transparent: false,
    cutout: true,
    replaceable: false,
    blocksWeather: true,
    textures: { all: 'oak_leaves' },
    tints: {
      top: LEAF_TINT,
      bottom: LEAF_TINT,
      side: LEAF_TINT,
    },
    renderType: 'leaves',
    lightOpacity: 1,
    receivesAmbientOcclusion: true,
    contributesAmbientOcclusion: false,
  });

  registerBlock(registry, {
    id: BlockIds.SpruceLog,
    name: 'spruce_log',
    displayName: 'Spruce Log',
    solid: true,
    transparent: false,
    replaceable: false,
    blocksWeather: true,
    textures: {
      top: 'spruce_top',
      bottom: 'spruce_top',
      side: 'spruce_side',
    },
    renderType: 'opaque',
  });

  registerBlock(registry, {
    id: BlockIds.SpruceLeaves,
    name: 'spruce_leaves',
    displayName: 'Spruce Leaves',
    solid: true,
    transparent: false,
    cutout: true,
    replaceable: false,
    blocksWeather: true,
    textures: { all: 'spruce_leaves' },
    tints: {
      top: LEAF_TINT,
      bottom: LEAF_TINT,
      side: LEAF_TINT,
    },
    renderType: 'leaves',
    lightOpacity: 1,
    receivesAmbientOcclusion: true,
    contributesAmbientOcclusion: false,
  });


  registerBlock(registry, {
    id: BlockIds.Obsidian,
    name: 'obsidian',
    displayName: 'Obsidian',
    solid: true,
    transparent: false,
    replaceable: false,
    blocksWeather: true,
    textures: { all: 'obsidian' },
    renderType: 'opaque',
  });

  // Ores and other Blocks added for Stage 12D
  registerBlock(registry, {
    id: BlockIds.MossyCobblestone,
    name: 'mossy_cobbled',
    displayName: 'Mossy Cobblestone',
    solid: true,
    transparent: false,
    replaceable: false,
    blocksWeather: true,
    textures: { all: 'mossy_cobble' },
    renderType: 'opaque',
  });

  registerBlock(registry, {
    id: BlockIds.CoalOre,
    name: 'coal_ore',
    displayName: 'Coal Ore',
    solid: true,
    transparent: false,
    replaceable: false,
    blocksWeather: true,
    textures: { all: 'coal_ore' },
    renderType: 'opaque',
  });

  registerBlock(registry, {
    id: BlockIds.IronOre,
    name: 'iron_ore',
    displayName: 'Iron Ore',
    solid: true,
    transparent: false,
    replaceable: false,
    blocksWeather: true,
    textures: { all: 'iron_ore' },
    renderType: 'opaque',
  });

  registerBlock(registry, {
    id: BlockIds.GoldOre,
    name: 'gold_ore',
    displayName: 'Gold Ore',
    solid: true,
    transparent: false,
    replaceable: false,
    blocksWeather: true,
    textures: { all: 'gold_ore' },
    renderType: 'opaque',
  });

  registerBlock(registry, {
    id: BlockIds.RedstoneOre,
    name: 'redstone_ore',
    displayName: 'Redstone Ore',
    solid: true,
    transparent: false,
    replaceable: false,
    blocksWeather: true,
    textures: { all: 'redstone_ore' },
    renderType: 'opaque',
  });

  registerBlock(registry, {
    id: BlockIds.DiamondOre,
    name: 'diamond_ore',
    displayName: 'Diamond Ore',
    solid: true,
    transparent: false,
    replaceable: false,
    blocksWeather: true,
    textures: { all: 'diamond_ore' },
    renderType: 'opaque',
  });

  registerBlock(registry, {
    id: BlockIds.LapisOre,
    name: 'lapis_ore',
    displayName: 'Lapis Lazuli Ore',
    solid: true,
    transparent: false,
    replaceable: false,
    blocksWeather: true,
    textures: { all: 'lapis_ore' },
    renderType: 'opaque',
  });

  registerBlock(registry, {
    id: BlockIds.Chest,
    name: 'chest',
    displayName: 'Chest',
    solid: true,
    transparent: false,
    replaceable: false,
    blocksWeather: true,
    textures: {
      top: 'singlechest_top',
      bottom: 'singlechest_top',
      side: 'singlechest_side',
      front: 'singlechest_front',
    },
    renderType: 'chest',
  });

  registerBlock(registry, {
    id: BlockIds.Spawner,
    name: 'spawner',
    displayName: 'Mob Spawner',
    solid: true,
    transparent: true,
    cutout: true,
    replaceable: false,
    blocksWeather: true,
    textures: { all: 'monster_spawner' },
    renderType: 'cutout',
  });

  registerBlock(registry, {
    id: BlockIds.Dandelion,
    name: 'dandelion',
    displayName: 'Dandelion',
    solid: false,
    transparent: true,
    replaceable: true,
    blocksWeather: false,
    textures: { all: 'dandi' },
    renderType: 'cross',
  });

  registerBlock(registry, {
    id: BlockIds.Rose,
    name: 'rose',
    displayName: 'Rose',
    solid: false,
    transparent: true,
    replaceable: true,
    blocksWeather: false,
    textures: { all: 'rose' },
    renderType: 'cross',
  });

  registerBlock(registry, {
    id: BlockIds.BrownMushroom,
    name: 'brown_mushroom',
    displayName: 'Brown Mushroom',
    solid: false,
    transparent: true,
    replaceable: true,
    blocksWeather: false,
    textures: { all: 'brown_mush' },
    renderType: 'cross',
  });

  registerBlock(registry, {
    id: BlockIds.RedMushroom,
    name: 'red_mushroom',
    displayName: 'Red Mushroom',
    solid: false,
    transparent: true,
    replaceable: true,
    blocksWeather: false,
    textures: { all: 'red_mush' },
    renderType: 'cross',
  });

  registerBlock(registry, {
    id: BlockIds.TallGrass,
    name: 'tall_grass',
    displayName: 'Tall Grass',
    solid: false,
    transparent: true,
    replaceable: true,
    blocksWeather: false,
    textures: { all: 'tall_grass' },
    tints: {
      top: GRASS_TOP_TINT,
      bottom: GRASS_TOP_TINT,
      side: GRASS_TOP_TINT,
    },
    renderType: 'cross',
  });

  registerBlock(registry, {
    id: BlockIds.DeadBush,
    name: 'dead_bush',
    displayName: 'Dead Bush',
    solid: false,
    transparent: true,
    replaceable: true,
    blocksWeather: false,
    textures: { all: 'dead_bush' },
    renderType: 'cross',
  });

  registerBlock(registry, {
    id: BlockIds.Reed,
    name: 'reed',
    displayName: 'Sugar Cane',
    solid: false,
    transparent: true,
    replaceable: true,
    blocksWeather: false,
    textures: { all: 'reeds' },
    renderType: 'cross',
  });

  registerBlock(registry, {
    id: BlockIds.Pumpkin,
    name: 'pumpkin',
    displayName: 'Pumpkin',
    solid: true,
    transparent: false,
    replaceable: false,
    blocksWeather: true,
    textures: {
      top: 'pumpkin_top',
      bottom: 'pumpkin_top',
      side: 'pumpkin_side',
    },
    renderType: 'opaque',
  });

  registerBlock(registry, {
    id: BlockIds.Cactus,
    name: 'cactus',
    displayName: 'Cactus',
    solid: true,
    transparent: true,
    replaceable: false,
    blocksWeather: true,
    textures: {
      top: 'cactus_top',
      bottom: 'cactus_bottom',
      side: 'cactus_side',
    },
    renderType: 'cactus',
  });

  // Stationary Lava block used by Lakes
  registerBlock(registry, {
    id: BlockIds.LavaStill,
    name: 'lava_still',
    displayName: 'Still Lava',
    solid: false,
    transparent: true,
    replaceable: true,
    blocksWeather: true,
    isLiquid: true,
    isTargetable:false,
    isBreakable:false,
    textures: { all: 'lava' },
    renderType: 'fluid',
    lightOpacity: 3,
    // Beta level 15; the tint is the project's colour extension.
    lightEmission: { level: 15, color: LIGHT_COLOR_LAVA },
  });

  const registerSimple = (id: number, name: string, displayName: string, textures: { all?: string; top?: string; bottom?: string; side?: string; front?: string }, options: { solid: boolean; transparent: boolean; replaceable: boolean; renderType: 'opaque' | 'cutout' | 'cross' | 'cactus' | 'snow' | 'ice'; blocksWeather?: boolean; lightOpacity?: number; lightEmission?: number | BlockLightEmission }): void => {
    registerBlock(registry, { id, name, displayName, textures, ...options });
  };

  registerSimple(BlockIds.Sapling, 'sapling', 'Sapling', { all: 'sapling_oak' }, { solid: false, transparent: true, replaceable: true, renderType: 'cross' });
  registerSimple(BlockIds.Fire, 'fire', 'Fire', { all: 'fire_layer_0' }, { solid: false, transparent: true, replaceable: true, renderType: 'cross', blocksWeather: false, lightEmission: { level: 15, color: LIGHT_COLOR_FIRE } });
  registerSimple(BlockIds.Farmland, 'farmland', 'Farmland', { top: 'farmland_dry', bottom: 'dirt', side: 'dirt' }, { solid: true, transparent: false, replaceable: false, renderType: 'opaque', blocksWeather: true });
  registerSimple(BlockIds.Crops, 'wheat', 'Wheat', { all: 'wheat_stage_0' }, { solid: false, transparent: true, replaceable: true, renderType: 'cross' });
  // Snow layer: non-solid, non-full block, cutout render with custom height
  // Beta: Material.snow, isOpaqueCube=false, renderAsNormalBlock=false
  // Height: 0.125 blocks (1/8), collision only at metadata >= 3
  registerSimple(BlockIds.Snow, 'snow', 'Snow', { all: 'snow' }, { solid: false, transparent: true, replaceable: true, renderType: 'snow', blocksWeather: true, lightOpacity: 0 });

  // Ice: transparent solid block, translucent render pass (pass 1)
  // Beta: BlockBreakable with Material.ice, render pass 1
  registerSimple(BlockIds.Ice, 'ice', 'Ice', { all: 'clear_ice' }, { solid: true, transparent: true, replaceable: false, renderType: 'ice', blocksWeather: true, lightOpacity: 3 });
  // Glass: transparent solid, full cube, translucent pass (Beta pass 1)
  registerSimple(BlockIds.Glass, 'glass', 'Glass', { all: 'glass' }, { solid: true, transparent: true, replaceable: false, renderType: 'ice', blocksWeather: true, lightOpacity: 0 });

  // Birch species (temp IDs) for Stage 5 leaf decay validation — textures exist in Beta
  // Birch Leaves: same properties as Oak/Spruce leaves, cutout, blocksWeather true, foliage tint handled via definition if needed
  registerBlock(registry, {
    id: (BlockIds as any).BirchLeaves ?? 250,
    name: 'birch_leaves',
    displayName: 'Birch Leaves',
    solid: true,
    transparent: false,
    cutout: true,
    replaceable: false,
    blocksWeather: true,
    textures: { all: 'birch_leaves' },
    tints: {
      top: LEAF_TINT,
      bottom: LEAF_TINT,
      side: LEAF_TINT,
    },
    renderType: 'leaves',
    lightOpacity: 1,
    receivesAmbientOcclusion: true,
    contributesAmbientOcclusion: false,
  });

  registerBlock(registry, {
    id: (BlockIds as any).BirchLog ?? 251,
    name: 'birch_log',
    displayName: 'Birch Log',
    solid: true,
    transparent: false,
    replaceable: false,
    blocksWeather: true,
    textures: {
      top: 'birch_top',
      bottom: 'birch_top',
      side: 'birch_side',
    },
    renderType: 'opaque',
  });

  registerSimple(BlockIds.SnowBlock, 'snow_block', 'Snow Block', { all: 'snow' }, { solid: true, transparent: false, replaceable: false, renderType: 'opaque', blocksWeather: true });
  // Torches use the dedicated 3D `buildTorch` mesher path (post + top face,
  // tilted for wall mounts). That path is only reached from the 'cutout'
  // branch; 'cross' would fall through to the generic crossed-planes model.
  registerSimple(BlockIds.Torch, 'torch', 'Torch', { all: 'torch_on' }, { solid: false, transparent: true, replaceable: true, renderType: 'cutout', lightEmission: { level: 14, color: LIGHT_COLOR_TORCH } });
  registerSimple(BlockIds.Ladder, 'ladder', 'Ladder', { all: 'ladder' }, { solid: false, transparent: true, replaceable: false, renderType: 'cutout' });
  registerSimple(BlockIds.SignPost, 'sign_post', 'Sign', { all: 'planks_oak' }, { solid: false, transparent: true, replaceable: true, renderType: 'cutout' });
  registerSimple(BlockIds.WallSign, 'wall_sign', 'Wall Sign', { all: 'planks_oak' }, { solid: false, transparent: true, replaceable: true, renderType: 'cutout' });
  registerSimple(BlockIds.StoneButton, 'stone_button', 'Stone Button', { all: 'stone' }, { solid: false, transparent: true, replaceable: false, renderType: 'cutout' });
  registerSimple(BlockIds.Lever, 'lever', 'Lever', { all: 'lever' }, { solid: false, transparent: true, replaceable: false, renderType: 'cutout' });
  registerSimple(BlockIds.StonePressurePlate, 'stone_pressure_plate', 'Stone Pressure Plate', { all: 'stone' }, { solid: false, transparent: true, replaceable: false, renderType: 'cutout' });
  registerSimple(BlockIds.WoodPressurePlate, 'wood_pressure_plate', 'Wood Pressure Plate', { all: 'planks_oak' }, { solid: false, transparent: true, replaceable: false, renderType: 'cutout' });
  registerSimple(BlockIds.WoodDoor, 'wood_door', 'Wood Door', { all: 'door_wood_lower' }, { solid: true, transparent: true, replaceable: false, renderType: 'cutout' });
  // Project wood-door extensions. Identical shape/behaviour to the oak door;
  // only the texture differs, so they reuse DoorBehaviour and doorShape.
  registerSimple(BlockIds.SpruceDoor, 'spruce_door', 'Spruce Door', { all: 'door_spruce_lower' }, { solid: true, transparent: true, replaceable: false, renderType: 'cutout' });
  registerSimple(BlockIds.BirchDoor, 'birch_door', 'Birch Door', { all: 'door_birch_lower' }, { solid: true, transparent: true, replaceable: false, renderType: 'cutout' });
  registerSimple(BlockIds.IronDoor, 'iron_door', 'Iron Door', { all: 'door_iron_lower' }, { solid: true, transparent: true, replaceable: false, renderType: 'cutout' });
  registerSimple(BlockIds.Trapdoor, 'trapdoor', 'Trapdoor', { all: 'trapdoor' }, { solid: true, transparent: true, replaceable: false, renderType: 'cutout' });
  registerSimple(BlockIds.Rail, 'rail', 'Rail', { all: 'rail_normal' }, { solid: false, transparent: true, replaceable: false, renderType: 'cutout' });
  registerSimple(BlockIds.PoweredRail, 'powered_rail', 'Powered Rail', { all: 'rail_golden' }, { solid: false, transparent: true, replaceable: false, renderType: 'cutout' });
  registerSimple(BlockIds.DetectorRail, 'detector_rail', 'Detector Rail', { all: 'rail_detector' }, { solid: false, transparent: true, replaceable: false, renderType: 'cutout' });
  registerSimple(BlockIds.RedstoneTorchOn, 'redstone_torch_on', 'Redstone Torch', { all: 'redstone_torch_on' }, { solid: false, transparent: true, replaceable: true, renderType: 'cutout', lightEmission: { level: 7, color: LIGHT_COLOR_REDSTONE } });
  registerSimple(BlockIds.RedstoneTorchOff, 'redstone_torch_off', 'Redstone Torch (Off)', { all: 'redstone_torch_off' }, { solid: false, transparent: true, replaceable: true, renderType: 'cutout' });

  registerBlock(registry, {
    id: BlockIds.RedstoneWire,
    name: 'redstone_wire',
    displayName: 'Redstone Wire',
    solid: false,
    transparent: true,
    replaceable: true,
    blocksWeather: false,
    textures: { all: 'redstone_dust_line' },
    renderType: 'redstone_wire',
  });

  // Fire-related blocks for Stage 2/3 fire system.
  // Full opaque cubes that participate in flammability:
  registerSimple(BlockIds.Planks, 'planks', 'Oak Wood Planks', { all: 'planks_oak' }, { solid: true, transparent: false, replaceable: false, renderType: 'opaque', blocksWeather: true });
  // Project wood extensions (see BetaDeviations.ts). Beta 1.7.3 has only
  // Planks(5); these species reuse the same behaviour, sounds and hardness.
  registerSimple(BlockIds.SprucePlanks, 'spruce_planks', 'Spruce Wood Planks', { all: 'planks_spruce' }, { solid: true, transparent: false, replaceable: false, renderType: 'opaque', blocksWeather: true });
  registerSimple(BlockIds.BirchPlanks, 'birch_planks', 'Birch Wood Planks', { all: 'planks_birch' }, { solid: true, transparent: false, replaceable: false, renderType: 'opaque', blocksWeather: true });
  registerSimple(BlockIds.CraftingTable, 'crafting_table', 'Crafting Table', { top: 'crafting_table_top', bottom: 'planks_oak', side: 'crafting_table_side', front: 'crafting_table_front' }, { solid: true, transparent: false, replaceable: false, renderType: 'opaque', blocksWeather: true });
  registerSimple(BlockIds.Furnace, 'furnace', 'Furnace', { top: 'furnace_top', bottom: 'furnace_top', side: 'furnace_side', front: 'furnace_front_off' }, { solid: true, transparent: false, replaceable: false, renderType: 'opaque', blocksWeather: true });
  registerSimple(BlockIds.FurnaceBurning, 'lit_furnace', 'Furnace', { top: 'furnace_top', bottom: 'furnace_top', side: 'furnace_side', front: 'furnace_front_on' }, { solid: true, transparent: false, replaceable: false, renderType: 'opaque', blocksWeather: true, lightEmission: { level: 13, color: LIGHT_COLOR_FURNACE } });
  registerSimple(BlockIds.Bookshelf, 'bookshelf', 'Bookshelf', { top: 'planks_oak', bottom: 'planks_oak', side: 'bookshelf' }, { solid: true, transparent: false, replaceable: false, renderType: 'opaque', blocksWeather: true });
  registerSimple(BlockIds.Wool, 'wool', 'White Wool', { all: 'wool_colored_white' }, { solid: true, transparent: false, replaceable: false, renderType: 'opaque', blocksWeather: true });
  registerSimple(BlockIds.TNT, 'tnt', 'TNT', { top: 'tnt_top', bottom: 'tnt_bottom', side: 'tnt_side' }, { solid: true, transparent: false, replaceable: false, renderType: 'opaque', blocksWeather: true });
  registerSimple(BlockIds.Netherrack, 'netherrack', 'Netherrack', { all: 'netherrack' }, { solid: true, transparent: false, replaceable: false, renderType: 'opaque', blocksWeather: true });

  // Beta 1.7.3 blocks 22/24/41/42/45/57/67/88/89.
  // Sandstone has distinct top/bottom faces (BlockSandStone).
  registerSimple(BlockIds.SandStone, 'sandstone', 'Sandstone', { top: 'sandstone_top', bottom: 'sandstone_bottom', side: 'sandstone_normal' }, { solid: true, transparent: false, replaceable: false, renderType: 'opaque', blocksWeather: true });
  registerSimple(BlockIds.LapisBlock, 'lapis_block', 'Lapis Lazuli Block', { all: 'lapis_block' }, { solid: true, transparent: false, replaceable: false, renderType: 'opaque', blocksWeather: true });
  registerSimple(BlockIds.GoldBlock, 'gold_block', 'Block of Gold', { all: 'gold_block' }, { solid: true, transparent: false, replaceable: false, renderType: 'opaque', blocksWeather: true });
  registerSimple(BlockIds.IronBlock, 'iron_block', 'Block of Iron', { all: 'iron_block' }, { solid: true, transparent: false, replaceable: false, renderType: 'opaque', blocksWeather: true });
  registerSimple(BlockIds.DiamondBlock, 'diamond_block', 'Block of Diamond', { all: 'diamond_block' }, { solid: true, transparent: false, replaceable: false, renderType: 'opaque', blocksWeather: true });
  registerSimple(BlockIds.BrickBlock, 'brick_block', 'Bricks', { all: 'brick' }, { solid: true, transparent: false, replaceable: false, renderType: 'opaque', blocksWeather: true });
  // Glowstone emits Beta's full light value (setLightValue(1.0F) -> 15).
  registerSimple(BlockIds.Glowstone, 'glowstone', 'Glowstone', { all: 'glowstone' }, { solid: true, transparent: false, replaceable: false, renderType: 'opaque', blocksWeather: true, lightEmission: { level: 15, color: LIGHT_COLOR_GLOWSTONE } });

  // Beta `Block.portal`: new BlockPortal(90, 14).setHardness(-1.0F)
  //   .setStepSound(soundGlassFootstep).setLightValue(0.75F)
  // 0.75 * 15 = light level 11. Hardness -1 makes it unbreakable by hand, and
  // it is never placed from the inventory: fire on an obsidian frame creates
  // it. Rendered by its own animated pass, not as ordinary terrain.
  registerBlock(registry, {
    id: BlockIds.Portal,
    name: 'portal',
    displayName: 'Portal',
    solid: false,
    transparent: true,
    replaceable: false,
    blocksWeather: false,
    unbreakable: true,
    textures: { all: 'portal' },
    renderType: 'portal',
    lightEmission: { level: 11, color: LIGHT_COLOR_PORTAL },
    lightOpacity: 0,
    creativeVisible: false,
  });
  // Soul sand: a full-width block standing 1/8 short, so entities sink into it.
  registerSimple(BlockIds.SoulSand, 'soul_sand', 'Soul Sand', { all: 'soul_sand' }, { solid: true, transparent: false, replaceable: false, renderType: 'opaque', blocksWeather: true });
  // Cobblestone stairs share the stair geometry/bounds with wooden stairs.
  registerSimple(BlockIds.CobblestoneStairs, 'cobblestone_stairs', 'Cobblestone Stairs', { all: 'cobblestone' }, { solid: false, transparent: true, replaceable: false, renderType: 'cutout', blocksWeather: false });
  // Bed: two-block furniture, 9/16 tall. Textures resolve per half at mesh time.
  registerSimple(BlockIds.Bed, 'bed', 'Bed', { top: 'bed_feet_top', bottom: 'planks_oak', side: 'bed_feet_side' }, { solid: false, transparent: true, replaceable: false, renderType: 'cutout', blocksWeather: true });

  // Non-full blocks: NOT solid normal cubes, do NOT block weather.
  // Fence: has custom collision in Beta (1.5 blocks tall) but is NOT a
  // full normal cube. Rendered as cutout for now (proper fence geometry
  // deferred). blocksWeather: false per Beta's Material.wood behaviour.
  registerSimple(BlockIds.Fence, 'fence', 'Oak Fence', { all: 'planks_oak' }, { solid: false, transparent: true, replaceable: false, renderType: 'cutout', blocksWeather: false });

  // Wooden stairs: non-full block, NOT a normal cube. blocksWeather: false.
  registerSimple(BlockIds.WoodStairs, 'wood_stairs', 'Oak Wood Stairs', { all: 'planks_oak' }, { solid: false, transparent: true, replaceable: false, renderType: 'cutout', blocksWeather: false });

  // Wooden slab: non-full block (half height). blocksWeather: false.
  // Beta `BlockStep`: one slab id whose metadata selects the material
  // (0 stone, 1 sandstone, 2 wood, 3 cobblestone). The base definition
  // carries the metadata-0 stone textures; per-variant textures are resolved
  // by resolveSlabTexture at mesh time.
  registerSimple(BlockIds.Slab, 'stone_slab', 'Stone Slab', { top: 'stone_slab_top', bottom: 'stone_slab_top', side: 'stone_slab_side' }, { solid: false, transparent: true, replaceable: false, renderType: 'cutout', blocksWeather: false });

  // Double wooden slab: full block, solid.
  registerSimple(BlockIds.DoubleSlab, 'double_slab', 'Double Stone Slab', { top: 'stone_slab_top', bottom: 'stone_slab_top', side: 'stone_slab_side' }, { solid: true, transparent: false, replaceable: false, renderType: 'opaque', blocksWeather: true });

  // Post-process blocks to apply authentic Beta 1.7.3 hardness and harvestableByHand properties
  const hardnessMap: Record<number, number> = {
    [BlockIds.Air]: 0.0,
    [BlockIds.Stone]: 1.5,
    [BlockIds.Grass]: 0.6,
    [BlockIds.Dirt]: 0.5,
    [BlockIds.Cobblestone]: 2.0,
    [BlockIds.Bedrock]: -1.0,
    [BlockIds.Sand]: 0.5,
    [BlockIds.Gravel]: 0.6,
    [BlockIds.Clay]: 0.6,
    [BlockIds.Podzol]: 0.5,
    [BlockIds.CoarseDirt]: 0.5,
    [BlockIds.Log]: 2.0,
    [BlockIds.SpruceLog]: 2.0,
    [251]: 2.0, // BirchLog
    [BlockIds.Leaves]: 0.2,
    [BlockIds.SpruceLeaves]: 0.2,
    [250]: 0.2, // BirchLeaves
    [BlockIds.Obsidian]: 10.0,
    [BlockIds.MossyCobblestone]: 2.0,
    [BlockIds.CoalOre]: 3.0,
    [BlockIds.IronOre]: 3.0,
    [BlockIds.GoldOre]: 3.0,
    [BlockIds.RedstoneOre]: 3.0,
    [BlockIds.DiamondOre]: 3.0,
    [BlockIds.LapisOre]: 3.0,
    [BlockIds.Chest]: 2.5,
    [BlockIds.Spawner]: 5.0,
    [BlockIds.Dandelion]: 0.0,
    [BlockIds.Rose]: 0.0,
    [BlockIds.BrownMushroom]: 0.0,
    [BlockIds.RedMushroom]: 0.0,
    [BlockIds.TallGrass]: 0.0,
    [BlockIds.DeadBush]: 0.0,
    [BlockIds.Reed]: 0.0,
    [BlockIds.Pumpkin]: 1.0,
    [BlockIds.Cactus]: 0.4,
    [BlockIds.WaterFlowing]: 100.0,
    [BlockIds.WaterStill]: 100.0,
    [BlockIds.LavaFlowing]: 100.0,
    [BlockIds.LavaStill]: 100.0,
    [BlockIds.Sapling]: 0.0,
    [BlockIds.Fire]: 0.0,
    [BlockIds.Farmland]: 0.6,
    [BlockIds.Crops]: 0.0,
    [BlockIds.Snow]: 0.1,
    [BlockIds.Ice]: 0.5,
    [BlockIds.Glass]: 0.3,
    [BlockIds.SnowBlock]: 0.2,
    [BlockIds.Torch]: 0.0,
    [BlockIds.RedstoneTorchOn]: 0.0,
    [BlockIds.RedstoneTorchOff]: 0.0,
    [BlockIds.Ladder]: 0.4,
    [BlockIds.SignPost]: 1.0,
    [BlockIds.WallSign]: 1.0,
    [BlockIds.StoneButton]: 0.5,
    [BlockIds.Lever]: 0.5,
    [BlockIds.StonePressurePlate]: 0.5,
    [BlockIds.WoodPressurePlate]: 0.5,
    [BlockIds.WoodDoor]: 3.0,
    [BlockIds.IronDoor]: 5.0,
    [BlockIds.Trapdoor]: 3.0,
    [BlockIds.Rail]: 0.7,
    [BlockIds.PoweredRail]: 0.7,
    [BlockIds.DetectorRail]: 0.7,
    [BlockIds.RedstoneWire]: 0.0,
    [BlockIds.Planks]: 2.0,
    [BlockIds.CraftingTable]: 2.5,
    [BlockIds.Furnace]: 3.5,
    [BlockIds.FurnaceBurning]: 3.5,
    [BlockIds.Bookshelf]: 1.5,
    [BlockIds.Wool]: 0.8,
    [BlockIds.TNT]: 0.0,
    [BlockIds.Netherrack]: 0.4,
    [BlockIds.SandStone]: 0.8,
    [BlockIds.LapisBlock]: 3.0,
    [BlockIds.GoldBlock]: 3.0,
    [BlockIds.IronBlock]: 5.0,
    [BlockIds.DiamondBlock]: 5.0,
    [BlockIds.BrickBlock]: 2.0,
    [BlockIds.Glowstone]: 0.3,
    [BlockIds.SoulSand]: 0.5,
    [BlockIds.CobblestoneStairs]: 2.0,
    [BlockIds.Bed]: 0.2,
    [BlockIds.Fence]: 2.0,
    [BlockIds.WoodStairs]: 2.0,
    [BlockIds.Slab]: 2.0,
    [BlockIds.DoubleSlab]: 2.0,
  };

  const handHarvestableMap: Record<number, boolean> = {
    [BlockIds.Stone]: false,
    [BlockIds.Cobblestone]: false,
    [BlockIds.Bedrock]: false,
    [BlockIds.Obsidian]: false,
    [BlockIds.MossyCobblestone]: false,
    [BlockIds.CoalOre]: false,
    [BlockIds.IronOre]: false,
    [BlockIds.GoldOre]: false,
    [BlockIds.RedstoneOre]: false,
    [BlockIds.DiamondOre]: false,
    [BlockIds.LapisOre]: false,
    [BlockIds.Furnace]: false,
    [BlockIds.FurnaceBurning]: false,
    [BlockIds.Spawner]: false,
    [BlockIds.Snow]: false,
    [BlockIds.SnowBlock]: false,
    [BlockIds.Netherrack]: false,
  };

  const pickaxePreferred=new Set<number>([BlockIds.SandStone,BlockIds.LapisBlock,BlockIds.GoldBlock,BlockIds.IronBlock,BlockIds.DiamondBlock,BlockIds.BrickBlock,BlockIds.CobblestoneStairs,BlockIds.Glowstone,BlockIds.Cobblestone,BlockIds.DoubleSlab,BlockIds.Slab,BlockIds.Stone,BlockIds.MossyCobblestone,BlockIds.IronOre,BlockIds.CoalOre,BlockIds.GoldOre,BlockIds.DiamondOre,BlockIds.Ice,BlockIds.Netherrack,BlockIds.LapisOre]);
  const axePreferred=new Set<number>([BlockIds.Planks,BlockIds.Bookshelf,BlockIds.Log,BlockIds.SpruceLog,251,BlockIds.Chest]);
  const shovelPreferred=new Set<number>([BlockIds.SoulSand,BlockIds.Grass,BlockIds.Dirt,BlockIds.Sand,BlockIds.Gravel,BlockIds.Snow,BlockIds.SnowBlock,BlockIds.Clay,BlockIds.Farmland]);
  const pickRequirements=new Map<number,number>([[BlockIds.Stone,0],[BlockIds.Cobblestone,0],[BlockIds.MossyCobblestone,0],[BlockIds.CoalOre,0],[BlockIds.Furnace,0],[BlockIds.FurnaceBurning,0],[BlockIds.Netherrack,0],[BlockIds.Spawner,0],[BlockIds.IronDoor,0],[BlockIds.IronOre,1],[BlockIds.LapisOre,1],[BlockIds.GoldOre,2],[BlockIds.RedstoneOre,2],[BlockIds.DiamondOre,2],[BlockIds.LapisBlock,1],[BlockIds.IronBlock,1],[BlockIds.GoldBlock,2],[BlockIds.DiamondBlock,2],[BlockIds.SandStone,0],[BlockIds.BrickBlock,0],[BlockIds.CobblestoneStairs,0],[BlockIds.Obsidian,3]]);
  for(const def of registry.values()){const hardness=hardnessMap[def.id]??1,preferredToolClass=pickaxePreferred.has(def.id)?'pickaxe':axePreferred.has(def.id)?'axe':shovelPreferred.has(def.id)?'shovel':undefined,pickLevel=pickRequirements.get(def.id),snowTool=def.id===BlockIds.Snow||def.id===BlockIds.SnowBlock;registry.updateDefinition(def.id,{hardness,harvestableByHand:handHarvestableMap[def.id]??true,instantBreak:hardness===0,unbreakable:hardness<0,...(preferredToolClass?{preferredToolClass}:{}),...(pickLevel!==undefined?{requiresCorrectToolForDrops:true,minimumHarvestLevel:pickLevel,harvestToolClass:'pickaxe' as const}:snowTool?{requiresCorrectToolForDrops:true,minimumHarvestLevel:0,harvestToolClass:'shovel' as const}:{})});}
}
