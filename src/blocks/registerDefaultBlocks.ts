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
    blocksWeather: false,
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
    blocksWeather: true,
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

  registry.register({
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

  registry.register({
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

  registry.register({
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

  registry.register({
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

  registry.register({
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

  registry.register({
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

  registry.register({
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

  registry.register({
    id: BlockIds.WaterFlowing,
    name: 'flowing_water',
    displayName: 'Flowing Water',
    solid: false,
    transparent: true,
    replaceable: false,
    blocksWeather: true,
    isLiquid: true,
    textures: { all: 'water' },
    renderType: 'fluid',
    lightOpacity: 3,
  });

  registry.register({
    id: BlockIds.WaterStill,
    name: 'water',
    displayName: 'Water',
    solid: false,
    transparent: true,
    replaceable: false,
    blocksWeather: true,
    isLiquid: true,
    textures: { all: 'water' },
    renderType: 'fluid',
    lightOpacity: 3,
  });

  registry.register({
    id: BlockIds.LavaFlowing,
    name: 'flowing_lava',
    displayName: 'Flowing Lava',
    solid: false,
    transparent: true,
    replaceable: false,
    blocksWeather: true,
    isLiquid: true,
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
    blocksWeather: true,
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

  registry.register({
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

  registry.register({
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


  registry.register({
    id: BlockIds.Obsidian,
    name: 'obsidian',
    displayName: 'Obsidian',
    solid: true,
    transparent: false,
    replaceable: false,
    blocksWeather: true,
    textures: { all: 'bedrock' },
    renderType: 'opaque',
  });

  // Ores and other Blocks added for Stage 12D
  registry.register({
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

  registry.register({
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

  registry.register({
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

  registry.register({
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

  registry.register({
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

  registry.register({
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

  registry.register({
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

  registry.register({
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
    blocksWeather: true,
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
    blocksWeather: false,
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
    blocksWeather: false,
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
    blocksWeather: false,
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
    blocksWeather: false,
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
    blocksWeather: false,
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
    blocksWeather: false,
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
    blocksWeather: false,
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
    blocksWeather: true,
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
    blocksWeather: true,
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
    blocksWeather: true,
    isLiquid: true,
    textures: { all: 'lava' },
    renderType: 'fluid',
    lightOpacity: 3,
    lightEmission: 15,
  });

  const registerSimple = (id: number, name: string, displayName: string, textures: { all?: string; top?: string; bottom?: string; side?: string }, options: { solid: boolean; transparent: boolean; replaceable: boolean; renderType: 'opaque' | 'cutout' | 'cross' | 'cactus' | 'snow' | 'ice'; blocksWeather?: boolean; lightOpacity?: number; lightEmission?: number }): void => {
    registry.register({ id, name, displayName, textures, ...options });
  };

  registerSimple(BlockIds.Sapling, 'sapling', 'Sapling', { all: 'sapling_oak' }, { solid: false, transparent: true, replaceable: true, renderType: 'cross' });
  registerSimple(BlockIds.Fire, 'fire', 'Fire', { all: 'fire_layer_0' }, { solid: false, transparent: true, replaceable: true, renderType: 'cross', blocksWeather: false, lightEmission: 15 });
  registerSimple(BlockIds.Farmland, 'farmland', 'Farmland', { top: 'farmland_dry', bottom: 'dirt', side: 'dirt' }, { solid: true, transparent: false, replaceable: false, renderType: 'opaque', blocksWeather: true });
  registerSimple(BlockIds.Crops, 'wheat', 'Wheat', { all: 'wheat_stage_0' }, { solid: false, transparent: true, replaceable: true, renderType: 'cross' });
  // Snow layer: non-solid, non-full block, cutout render with custom height
  // Beta: Material.snow, isOpaqueCube=false, renderAsNormalBlock=false
  // Height: 0.125 blocks (1/8), collision only at metadata >= 3
  registerSimple(BlockIds.Snow, 'snow', 'Snow', { all: 'snow' }, { solid: false, transparent: true, replaceable: true, renderType: 'snow', blocksWeather: true, lightOpacity: 0 });

  // Ice: transparent solid block, translucent render pass (pass 1)
  // Beta: BlockBreakable with Material.ice, render pass 1
  registerSimple(BlockIds.Ice, 'ice', 'Ice', { all: 'clear_ice' }, { solid: true, transparent: true, replaceable: false, renderType: 'ice', blocksWeather: true, lightOpacity: 3 });
  registerSimple(BlockIds.SnowBlock, 'snow_block', 'Snow Block', { all: 'snow' }, { solid: true, transparent: false, replaceable: false, renderType: 'opaque', blocksWeather: true });
  registerSimple(BlockIds.Torch, 'torch', 'Torch', { all: 'torch_on' }, { solid: false, transparent: true, replaceable: true, renderType: 'cross', lightEmission: 14 });
  registerSimple(BlockIds.Ladder, 'ladder', 'Ladder', { all: 'ladder' }, { solid: false, transparent: true, replaceable: false, renderType: 'cutout' });
  registerSimple(BlockIds.SignPost, 'sign_post', 'Sign', { all: 'oak_side' }, { solid: false, transparent: true, replaceable: true, renderType: 'cutout' });
  registerSimple(BlockIds.WallSign, 'wall_sign', 'Wall Sign', { all: 'oak_side' }, { solid: false, transparent: true, replaceable: true, renderType: 'cutout' });
  registerSimple(BlockIds.StoneButton, 'stone_button', 'Stone Button', { all: 'stone' }, { solid: false, transparent: true, replaceable: false, renderType: 'cutout' });
  registerSimple(BlockIds.Lever, 'lever', 'Lever', { all: 'lever' }, { solid: false, transparent: true, replaceable: false, renderType: 'cutout' });
  registerSimple(BlockIds.StonePressurePlate, 'stone_pressure_plate', 'Stone Pressure Plate', { all: 'stone' }, { solid: false, transparent: true, replaceable: false, renderType: 'cutout' });
  registerSimple(BlockIds.WoodDoor, 'wood_door', 'Wood Door', { all: 'door_wood_lower' }, { solid: true, transparent: true, replaceable: false, renderType: 'cutout' });
  registerSimple(BlockIds.RedstoneTorch, 'redstone_torch', 'Redstone Torch', { all: 'redstone_torch_on' }, { solid: false, transparent: true, replaceable: true, renderType: 'cross', lightEmission: 7 });
  registerSimple(BlockIds.RedstoneBlock, 'redstone_block', 'Redstone Block', { all: 'redstone_block' }, { solid: true, transparent: false, replaceable: false, renderType: 'opaque', blocksWeather: true });
  registerSimple(BlockIds.RedstoneLampOff, 'redstone_lamp_off', 'Redstone Lamp', { all: 'redstone_lamp_off' }, { solid: true, transparent: false, replaceable: false, renderType: 'opaque', blocksWeather: true });
  registerSimple(BlockIds.RedstoneLampOn, 'redstone_lamp_on', 'Lit Redstone Lamp', { all: 'redstone_lamp_on' }, { solid: true, transparent: false, replaceable: false, renderType: 'opaque', blocksWeather: true, lightEmission: 15 });

  // Fire-related blocks for Stage 2/3 fire system.
  // Full opaque cubes that participate in flammability:
  registerSimple(BlockIds.Planks, 'planks', 'Oak Wood Planks', { all: 'planks_oak' }, { solid: true, transparent: false, replaceable: false, renderType: 'opaque', blocksWeather: true });
  registerSimple(BlockIds.Bookshelf, 'bookshelf', 'Bookshelf', { top: 'planks_oak', bottom: 'planks_oak', side: 'bookshelf' }, { solid: true, transparent: false, replaceable: false, renderType: 'opaque', blocksWeather: true });
  registerSimple(BlockIds.Wool, 'wool', 'White Wool', { all: 'wool_colored_white' }, { solid: true, transparent: false, replaceable: false, renderType: 'opaque', blocksWeather: true });
  registerSimple(BlockIds.TNT, 'tnt', 'TNT', { top: 'tnt_top', bottom: 'tnt_bottom', side: 'tnt_side' }, { solid: true, transparent: false, replaceable: false, renderType: 'opaque', blocksWeather: true });
  registerSimple(BlockIds.Netherrack, 'netherrack', 'Netherrack', { all: 'netherrack' }, { solid: true, transparent: false, replaceable: false, renderType: 'opaque', blocksWeather: true });

  // Non-full blocks: NOT solid normal cubes, do NOT block weather.
  // Fence: has custom collision in Beta (1.5 blocks tall) but is NOT a
  // full normal cube. Rendered as cutout for now (proper fence geometry
  // deferred). blocksWeather: false per Beta's Material.wood behaviour.
  registerSimple(BlockIds.Fence, 'fence', 'Oak Fence', { all: 'planks_oak' }, { solid: false, transparent: true, replaceable: false, renderType: 'cutout', blocksWeather: false });

  // Wooden stairs: non-full block, NOT a normal cube. blocksWeather: false.
  registerSimple(BlockIds.WoodStairs, 'wood_stairs', 'Oak Wood Stairs', { all: 'planks_oak' }, { solid: false, transparent: true, replaceable: false, renderType: 'cutout', blocksWeather: false });

  // Wooden slab: non-full block (half height). blocksWeather: false.
  registerSimple(BlockIds.WoodSlab, 'wood_slab', 'Oak Wood Slab', { all: 'planks_oak' }, { solid: false, transparent: true, replaceable: false, renderType: 'cutout', blocksWeather: false });
}
