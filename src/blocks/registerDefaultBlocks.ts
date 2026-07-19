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

  const registerSimple = (id: number, name: string, displayName: string, textures: { all?: string; top?: string; bottom?: string; side?: string; front?: string }, options: { solid: boolean; transparent: boolean; replaceable: boolean; renderType: 'opaque' | 'cutout' | 'cross' | 'cactus' | 'snow' | 'ice'; blocksWeather?: boolean; lightOpacity?: number; lightEmission?: number }): void => {
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
  // Glass: transparent solid, full cube, translucent pass (Beta pass 1)
  registerSimple(BlockIds.Glass, 'glass', 'Glass', { all: 'glass' }, { solid: true, transparent: true, replaceable: false, renderType: 'ice', blocksWeather: true, lightOpacity: 0 });

  // Birch species (temp IDs) for Stage 5 leaf decay validation — textures exist in Beta
  // Birch Leaves: same properties as Oak/Spruce leaves, cutout, blocksWeather true, foliage tint handled via definition if needed
  registry.register({
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

  registry.register({
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
  registerSimple(BlockIds.Torch, 'torch', 'Torch', { all: 'torch_on' }, { solid: false, transparent: true, replaceable: true, renderType: 'cross', lightEmission: 14 });
  registerSimple(BlockIds.Ladder, 'ladder', 'Ladder', { all: 'ladder' }, { solid: false, transparent: true, replaceable: false, renderType: 'cutout' });
  registerSimple(BlockIds.SignPost, 'sign_post', 'Sign', { all: 'oak_side' }, { solid: false, transparent: true, replaceable: true, renderType: 'cutout' });
  registerSimple(BlockIds.WallSign, 'wall_sign', 'Wall Sign', { all: 'oak_side' }, { solid: false, transparent: true, replaceable: true, renderType: 'cutout' });
  registerSimple(BlockIds.StoneButton, 'stone_button', 'Stone Button', { all: 'stone' }, { solid: false, transparent: true, replaceable: false, renderType: 'cutout' });
  registerSimple(BlockIds.Lever, 'lever', 'Lever', { all: 'lever' }, { solid: false, transparent: true, replaceable: false, renderType: 'cutout' });
  registerSimple(BlockIds.StonePressurePlate, 'stone_pressure_plate', 'Stone Pressure Plate', { all: 'stone' }, { solid: false, transparent: true, replaceable: false, renderType: 'cutout' });
  registerSimple(BlockIds.WoodDoor, 'wood_door', 'Wood Door', { all: 'door_wood_lower' }, { solid: true, transparent: true, replaceable: false, renderType: 'cutout' });
  registerSimple(BlockIds.Rail, 'rail', 'Rail', { all: 'rail_normal' }, { solid: false, transparent: true, replaceable: false, renderType: 'cutout' });
  registerSimple(BlockIds.PoweredRail, 'powered_rail', 'Powered Rail', { all: 'rail_golden' }, { solid: false, transparent: true, replaceable: false, renderType: 'cutout' });
  registerSimple(BlockIds.DetectorRail, 'detector_rail', 'Detector Rail', { all: 'rail_detector' }, { solid: false, transparent: true, replaceable: false, renderType: 'cutout' });
  registerSimple(BlockIds.RedstoneTorch, 'redstone_torch', 'Redstone Torch', { all: 'redstone_torch_on' }, { solid: false, transparent: true, replaceable: true, renderType: 'cross', lightEmission: 7 });
  registerSimple(BlockIds.RedstoneBlock, 'redstone_block', 'Redstone Block', { all: 'redstone_block' }, { solid: true, transparent: false, replaceable: false, renderType: 'opaque', blocksWeather: true });
  registerSimple(BlockIds.RedstoneLampOff, 'redstone_lamp_off', 'Redstone Lamp', { all: 'redstone_lamp_off' }, { solid: true, transparent: false, replaceable: false, renderType: 'opaque', blocksWeather: true });
  registerSimple(BlockIds.RedstoneLampOn, 'redstone_lamp_on', 'Lit Redstone Lamp', { all: 'redstone_lamp_on' }, { solid: true, transparent: false, replaceable: false, renderType: 'opaque', blocksWeather: true, lightEmission: 15 });

  // Fire-related blocks for Stage 2/3 fire system.
  // Full opaque cubes that participate in flammability:
  registerSimple(BlockIds.Planks, 'planks', 'Oak Wood Planks', { all: 'planks_oak' }, { solid: true, transparent: false, replaceable: false, renderType: 'opaque', blocksWeather: true });
  registerSimple(BlockIds.CraftingTable, 'crafting_table', 'Crafting Table', { top: 'crafting_table_top', bottom: 'planks_oak', side: 'crafting_table_side', front: 'crafting_table_front' }, { solid: true, transparent: false, replaceable: false, renderType: 'opaque', blocksWeather: true });
  registerSimple(BlockIds.Furnace, 'furnace', 'Furnace', { top: 'furnace_top', bottom: 'furnace_top', side: 'furnace_side', front: 'furnace_front_off' }, { solid: true, transparent: false, replaceable: false, renderType: 'opaque', blocksWeather: true });
  registerSimple(BlockIds.FurnaceBurning, 'lit_furnace', 'Furnace', { top: 'furnace_top', bottom: 'furnace_top', side: 'furnace_side', front: 'furnace_front_on' }, { solid: true, transparent: false, replaceable: false, renderType: 'opaque', blocksWeather: true, lightEmission: 13 });
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
    [BlockIds.RedstoneTorch]: 0.0,
    [BlockIds.Ladder]: 0.4,
    [BlockIds.SignPost]: 1.0,
    [BlockIds.WallSign]: 1.0,
    [BlockIds.StoneButton]: 0.5,
    [BlockIds.Lever]: 0.5,
    [BlockIds.StonePressurePlate]: 0.5,
    [BlockIds.WoodDoor]: 3.0,
    [BlockIds.Rail]: 0.7,
    [BlockIds.PoweredRail]: 0.7,
    [BlockIds.DetectorRail]: 0.7,
    [BlockIds.RedstoneBlock]: 5.0,
    [BlockIds.RedstoneLampOff]: 0.3,
    [BlockIds.RedstoneLampOn]: 0.3,
    [BlockIds.Planks]: 2.0,
    [BlockIds.CraftingTable]: 2.5,
    [BlockIds.Furnace]: 3.5,
    [BlockIds.FurnaceBurning]: 3.5,
    [BlockIds.Bookshelf]: 1.5,
    [BlockIds.Wool]: 0.8,
    [BlockIds.TNT]: 0.0,
    [BlockIds.Netherrack]: 0.4,
    [BlockIds.Fence]: 2.0,
    [BlockIds.WoodStairs]: 2.0,
    [BlockIds.WoodSlab]: 2.0,
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

  for (const def of registry.values()) {
    const mutableDef = def as any;
    mutableDef.hardness = hardnessMap[def.id] !== undefined ? hardnessMap[def.id] : 1.0;
    mutableDef.harvestableByHand = handHarvestableMap[def.id] !== undefined ? handHarvestableMap[def.id] : true;
  }
}
