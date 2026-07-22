import { ITEM_TEXTURE_LIST } from '../assets/itemTextureList';

const fallback = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#f0f"/></svg>');

const ITEM_ALIASES: Record<string, string> = {
  // Doors and Signs
  '64': 'door_wood',
  'wood_door': 'door_wood',
  '71': 'door_iron',
  'iron_door': 'door_iron',
  '63': 'sign',
  '68': 'sign',
  'sign_post': 'sign',
  'wall_sign': 'sign',
  '65': 'ladder',
  'ladder': 'ladder',
  // Reeds / Sugar cane
  '83': 'reeds',
  'reed': 'reeds',
  // Seeds / Crops
  '295': 'seeds_wheat',
  'seeds': 'seeds_wheat',
  'crops': 'seeds_wheat',
  // Basic Items / Ores
  '260': 'apple',
  '262': 'arrow',
  '263': 'coal',
  '264': 'diamond',
  '265': 'iron_ingot',
  '266': 'gold_ingot',
  '280': 'stick',
  '282': 'mushroom_stew',
  '297': 'bread',
  '319': 'porkchop_raw',
  '320': 'porkchop_cooked',
  '331': 'redstone_dust',
  '349': 'fish_cod_raw',
  '350': 'fish_cod_cooked',
  '357': 'cookie',
  '360': 'melon',
  '363': 'beef_raw',
  '364': 'beef_cooked',
  '365': 'chicken_raw',
  '366': 'chicken_cooked',
  '351': 'dye_powder_blue',
  '328': 'minecart_normal',
  'minecart': 'minecart_normal',
  // Weapons and Tools
  '268': 'wood_sword',
  '269': 'wood_shovel',
  '270': 'wood_pickaxe',
  '271': 'wood_axe',
  '290': 'wood_hoe',
  '272': 'stone_sword',
  '273': 'stone_shovel',
  '274': 'stone_pickaxe',
  '275': 'stone_axe',
  '291': 'stone_hoe',
  '267': 'iron_sword',
  '256': 'iron_shovel',
  '257': 'iron_pickaxe',
  '258': 'iron_axe',
  '292': 'iron_hoe',
  '276': 'diamond_sword',
  '277': 'diamond_shovel',
  '278': 'diamond_pickaxe',
  '279': 'diamond_axe',
  '293': 'diamond_hoe',
  '283': 'gold_sword',
  '284': 'gold_shovel',
  '285': 'gold_pickaxe',
  '286': 'gold_axe',
  '294': 'gold_hoe',
  // Beta armour item ids
  '298': 'leather_helmet',
  '299': 'leather_chestplate',
  '300': 'leather_leggings',
  '301': 'leather_boots',
  '302': 'chainmail_helmet',
  '303': 'chainmail_chestplate',
  '304': 'chainmail_leggings',
  '305': 'chainmail_boots',
  '306': 'iron_helmet',
  '307': 'iron_chestplate',
  '308': 'iron_leggings',
  '309': 'iron_boots',
  '310': 'diamond_helmet',
  '311': 'diamond_chestplate',
  '312': 'diamond_leggings',
  '313': 'diamond_boots',
  '314': 'gold_helmet',
  '315': 'gold_chestplate',
  '316': 'gold_leggings',
  '317': 'gold_boots',
};

const BLOCK_TEXTURE_FALLBACKS: Record<string, string> = {
  // Fire
  '51': '/textures/blocks/fire_layer_0.png',
  'fire': '/textures/blocks/fire_layer_0.png',
  // Tall Grass
  '31': '/textures/blocks/tall_grass.png',
  'tall_grass': '/textures/blocks/tall_grass.png',
  // Reeds block fallback
  'reeds_block': '/textures/blocks/reeds.png',
  // Flowers
  '37': '/textures/blocks/flower_dandelion.png',
  'dandelion': '/textures/blocks/flower_dandelion.png',
  '38': '/textures/blocks/flower_rose.png',
  'rose': '/textures/blocks/flower_rose.png',
  // Sapling
  '6': '/textures/blocks/sapling_oak.png',
  'sapling': '/textures/blocks/sapling_oak.png',
  // Torches
  '50': '/textures/blocks/torch_on.png',
  'torch': '/textures/blocks/torch_on.png',
  '76': '/textures/blocks/redstone_torch_on.png',
  'redstone_torch': '/textures/blocks/redstone_torch_on.png',
  // Rails
  '66': '/textures/blocks/rail_normal.png',
  'rail': '/textures/blocks/rail_normal.png',
  '27': '/textures/blocks/rail_golden.png',
  'powered_rail': '/textures/blocks/rail_golden.png',
  '28': '/textures/blocks/rail_detector.png',
  'detector_rail': '/textures/blocks/rail_detector.png',
  // Mushrooms
  '39': '/textures/blocks/mushroom_brown.png',
  'brown_mushroom': '/textures/blocks/mushroom_brown.png',
  '40': '/textures/blocks/mushroom_red.png',
  'red_mushroom': '/textures/blocks/mushroom_red.png',
  // Levers / Buttons / Plates
  '69': '/textures/blocks/lever.png',
  'lever': '/textures/blocks/lever.png',
  '77': '/textures/blocks/stone.png',
  'stone_button': '/textures/blocks/stone.png',
  '70': '/textures/blocks/stone.png',
  'stone_pressure_plate': '/textures/blocks/stone.png',
  // Dead Bush
  '32': '/textures/blocks/deadbush.png',
  'dead_bush': '/textures/blocks/deadbush.png',
  // Snow layer
  '78': '/textures/blocks/snow.png',
  'snow': '/textures/blocks/snow.png',
  // Crops / Wheat
  '59': '/textures/blocks/wheat_stage_7.png',
  'wheat': '/textures/blocks/wheat_stage_7.png',
  // Cactus
  '81': '/textures/blocks/cactus_side.png',
  'cactus': '/textures/blocks/cactus_side.png',
};

export class ItemIconResolver {
  private known = new Set(ITEM_TEXTURE_LIST);
  private cache = new Map<string, string>();

  static missing(): string {
    return fallback;
  }

  resolve(id: string): string {
    const found = this.cache.get(id);
    if (found) return found;

    // Step 1: Explicit item texture
    if (this.known.has(id)) {
      const url = `/textures/items/${id}.png`;
      this.cache.set(id, url);
      return url;
    }

    // Step 2: Explicit item alias
    const alias = ITEM_ALIASES[id];
    if (alias && this.known.has(alias)) {
      const url = `/textures/items/${alias}.png`;
      this.cache.set(id, url);
      return url;
    }

    // Step 3: Explicit block-texture fallback
    const blockFallback = BLOCK_TEXTURE_FALLBACKS[id];
    if (blockFallback) {
      this.cache.set(id, blockFallback);
      return blockFallback;
    }

    // Step 4: Development missing-texture icon
    console.warn(`[presentation] missing required icon mapping: ${id}`);
    this.cache.set(id, fallback);
    return fallback;
  }

  isKnown(id: string): boolean {
    return this.known.has(id) || id in ITEM_ALIASES || id in BLOCK_TEXTURE_FALLBACKS;
  }
}
