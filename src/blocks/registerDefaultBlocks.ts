import type { BlockRegistry } from './BlockRegistry';
import { BlockIds } from './BlockId';
import type { TintColor } from './BlockDefinition';

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
export function registerDefaultBlocks(registry: BlockRegistry): void {
  registry.register({
    id: BlockIds.Air,
    name: 'air',
    displayName: 'Air',
    solid: false,
    transparent: true,
    replaceable: true,
    textures: {},
    renderType: 'fluid',
  });

  registry.register({
    id: BlockIds.Stone,
    name: 'stone',
    displayName: 'Stone',
    solid: true,
    transparent: false,
    replaceable: false,
    textures: { all: 'stone' },
    renderType: 'opaque',
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
      top: GRASS_TOP_TINT,
    },
    renderType: 'opaque',
  });

  registry.register({
    id: BlockIds.Dirt,
    name: 'dirt',
    displayName: 'Dirt',
    solid: true,
    transparent: false,
    replaceable: false,
    textures: { all: 'dirt' },
    renderType: 'opaque',
  });

  registry.register({
    id: BlockIds.Cobblestone,
    name: 'cobblestone',
    displayName: 'Cobblestone',
    solid: true,
    transparent: false,
    replaceable: false,
    textures: { all: 'cobblestone' },
    renderType: 'opaque',
  });

  registry.register({
    id: BlockIds.Bedrock,
    name: 'bedrock',
    displayName: 'Bedrock',
    solid: true,
    transparent: false,
    replaceable: false,
    textures: { all: 'bedrock' },
    renderType: 'opaque',
  });

  registry.register({
    id: BlockIds.Sand,
    name: 'sand',
    displayName: 'Sand',
    solid: true,
    transparent: false,
    replaceable: false,
    textures: { all: 'sand' },
    renderType: 'opaque',
  });

  registry.register({
    id: BlockIds.Gravel,
    name: 'gravel',
    displayName: 'Gravel',
    solid: true,
    transparent: false,
    replaceable: false,
    textures: { all: 'gravel' },
    renderType: 'opaque',
  });

  registry.register({
    id: BlockIds.Clay,
    name: 'clay',
    displayName: 'Clay',
    solid: true,
    transparent: false,
    replaceable: false,
    textures: { all: 'clay' },
    renderType: 'opaque',
  });

  registry.register({
    id: BlockIds.Podzol,
    name: 'podzol',
    displayName: 'Podzol',
    solid: true,
    transparent: false,
    replaceable: false,
    textures: {
      top: 'podzol_top',
      bottom: 'dirt',
      side: 'podzol_side',
    },
    renderType: 'opaque',
  });

  registry.register({
    id: BlockIds.Water,
    name: 'water',
    displayName: 'Water',
    solid: false,
    transparent: true,
    replaceable: false,
    textures: { all: 'water' },
    renderType: 'fluid',
    lightOpacity: 3,
  });

  registry.register({
    id: BlockIds.Lava,
    name: 'lava',
    displayName: 'Lava',
    solid: false,
    transparent: true,
    replaceable: false,
    textures: { all: 'lava' },
    renderType: 'fluid',
    lightOpacity: 3,
    lightEmission: 15,
  });

  registry.register({
    id: BlockIds.Log,
    name: 'log',
    displayName: 'Oak Log',
    solid: true,
    transparent: false,
    replaceable: false,
    textures: {
      top: 'oak_top',
      bottom: 'oak_top',
      side: 'oak_side',
    },
    renderType: 'opaque',
  });

  registry.register({
    id: BlockIds.Leaves,
    name: 'leaves',
    displayName: 'Oak Leaves',
    solid: true,
    transparent: false,
    cutout: true,
    replaceable: false,
    textures: { all: 'oak_leaves' },
    tints: {
      top: LEAF_TINT,
      bottom: LEAF_TINT,
      side: LEAF_TINT,
    },
    renderType: 'leaves',
    lightOpacity: 1,
  });

  registry.register({
    id: BlockIds.SpruceLog,
    name: 'spruce_log',
    displayName: 'Spruce Log',
    solid: true,
    transparent: false,
    replaceable: false,
    textures: {
      top: 'spruce_top',
      bottom: 'spruce_top',
      side: 'spruce_side',
    },
    renderType: 'opaque',
  });

  registry.register({
    id: BlockIds.SpruceLeaves,
    name: 'spruce_leaves',
    displayName: 'Spruce Leaves',
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
    renderType: 'leaves',
    lightOpacity: 1,
  });

  // Ores and other Blocks added for Stage 12D
  registry.register({
    id: BlockIds.MossyCobblestone,
    name: 'mossy_cobbled',
    displayName: 'Mossy Cobblestone',
    solid: true,
    transparent: false,
    replaceable: false,
    textures: { all: 'mossy_cobble' },
    renderType: 'opaque',
  });

  registry.register({
    id: BlockIds.CoalOre,
    name: 'coal_ore',
    displayName: 'Coal Ore',
    solid: true,
    transparent: false,
    replaceable: false,
    textures: { all: 'coal_ore' },
    renderType: 'opaque',
  });

  registry.register({
    id: BlockIds.IronOre,
    name: 'iron_ore',
    displayName: 'Iron Ore',
    solid: true,
    transparent: false,
    replaceable: false,
    textures: { all: 'iron_ore' },
    renderType: 'opaque',
  });

  registry.register({
    id: BlockIds.GoldOre,
    name: 'gold_ore',
    displayName: 'Gold Ore',
    solid: true,
    transparent: false,
    replaceable: false,
    textures: { all: 'gold_ore' },
    renderType: 'opaque',
  });

  registry.register({
    id: BlockIds.RedstoneOre,
    name: 'redstone_ore',
    displayName: 'Redstone Ore',
    solid: true,
    transparent: false,
    replaceable: false,
    textures: { all: 'redstone_ore' },
    renderType: 'opaque',
  });

  registry.register({
    id: BlockIds.DiamondOre,
    name: 'diamond_ore',
    displayName: 'Diamond Ore',
    solid: true,
    transparent: false,
    replaceable: false,
    textures: { all: 'diamond_ore' },
    renderType: 'opaque',
  });

  registry.register({
    id: BlockIds.LapisOre,
    name: 'lapis_ore',
    displayName: 'Lapis Lazuli Ore',
    solid: true,
    transparent: false,
    replaceable: false,
    textures: { all: 'lapis_ore' },
    renderType: 'opaque',
  });

  registry.register({
    id: BlockIds.Chest,
    name: 'chest',
    displayName: 'Chest',
    solid: true,
    transparent: false,
    replaceable: false,
    textures: {
      top: 'singlechest_top',
      bottom: 'singlechest_top',
      side: 'singlechest_side',
    },
    renderType: 'opaque',
  });

  registry.register({
    id: BlockIds.Spawner,
    name: 'spawner',
    displayName: 'Mob Spawner',
    solid: true,
    transparent: true,
    cutout: true,
    replaceable: false,
    textures: { all: 'monster_spawner' },
    renderType: 'cutout',
  });

  registry.register({
    id: BlockIds.Dandelion,
    name: 'dandelion',
    displayName: 'Dandelion',
    solid: false,
    transparent: true,
    replaceable: true,
    textures: { all: 'dandi' },
    renderType: 'cross',
  });

  registry.register({
    id: BlockIds.Rose,
    name: 'rose',
    displayName: 'Rose',
    solid: false,
    transparent: true,
    replaceable: true,
    textures: { all: 'rose' },
    renderType: 'cross',
  });

  registry.register({
    id: BlockIds.BrownMushroom,
    name: 'brown_mushroom',
    displayName: 'Brown Mushroom',
    solid: false,
    transparent: true,
    replaceable: true,
    textures: { all: 'brown_mush' },
    renderType: 'cross',
  });

  registry.register({
    id: BlockIds.RedMushroom,
    name: 'red_mushroom',
    displayName: 'Red Mushroom',
    solid: false,
    transparent: true,
    replaceable: true,
    textures: { all: 'red_mush' },
    renderType: 'cross',
  });

  registry.register({
    id: BlockIds.TallGrass,
    name: 'tall_grass',
    displayName: 'Tall Grass',
    solid: false,
    transparent: true,
    replaceable: true,
    textures: { all: 'tall_grass' },
    tints: {
      top: GRASS_TOP_TINT,
      bottom: GRASS_TOP_TINT,
      side: GRASS_TOP_TINT,
    },
    renderType: 'cross',
  });

  registry.register({
    id: BlockIds.DeadBush,
    name: 'dead_bush',
    displayName: 'Dead Bush',
    solid: false,
    transparent: true,
    replaceable: true,
    textures: { all: 'dead_bush' },
    renderType: 'cross',
  });

  registry.register({
    id: BlockIds.Reed,
    name: 'reed',
    displayName: 'Sugar Cane',
    solid: false,
    transparent: true,
    replaceable: true,
    textures: { all: 'reeds' },
    renderType: 'cross',
  });

  registry.register({
    id: BlockIds.Pumpkin,
    name: 'pumpkin',
    displayName: 'Pumpkin',
    solid: true,
    transparent: false,
    replaceable: false,
    textures: {
      top: 'pumpkin_top',
      bottom: 'pumpkin_top',
      side: 'pumpkin_side',
    },
    renderType: 'opaque',
  });

  registry.register({
    id: BlockIds.Cactus,
    name: 'cactus',
    displayName: 'Cactus',
    solid: true,
    transparent: true,
    replaceable: false,
    textures: {
      top: 'cactus_top',
      bottom: 'cactus_bottom',
      side: 'cactus_side',
    },
    renderType: 'cactus',
  });

  // Stationary Lava block used by Lakes
  registry.register({
    id: BlockIds.LavaStill,
    name: 'lava_still',
    displayName: 'Still Lava',
    solid: false,
    transparent: true,
    replaceable: false,
    textures: { all: 'lava' },
    renderType: 'fluid',
    lightOpacity: 3,
    lightEmission: 15,
  });
}
