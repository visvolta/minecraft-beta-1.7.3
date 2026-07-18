import { BlockIds } from '../../../blocks/BlockId';
import type { BlockId } from '../../../blocks/BlockId';

/**
 * The 10 active Beta 1.7.3 Overworld biomes (from MobSpawnerBase's static
 * instances a, b, c, d, e, f, g, h, i, k — excluding Hell, which is
 * Nether-only and out of Overworld generation).
 *
 * Ice Desert (MobSpawnerBase.j) is deliberately NOT included: verified
 * directly against compiled, unmodified mc-dev source (and independently
 * corroborated by Project-Poseidon's BiomeBase, which mirrors the exact
 * same decision tree) that MobSpawnerBase.a(float,float) never returns
 * it — every code path that could plausibly reach Ice Desert instead
 * resolves to Desert, Tundra, or another biome. It is real, registered
 * dead data in Beta itself, not a biome this project should track.
 */
export type BiomeId =
  | 'rainforest'
  | 'swampland'
  | 'seasonalForest'
  | 'forest'
  | 'savanna'
  | 'shrubland'
  | 'taiga'
  | 'desert'
  | 'plains'
  | 'tundra';

/**
 * Surface blocks a biome would use in full Beta 1.7.3. This project only
 * has textures for a subset of the original blocks, so `topBlock`/
 * `fillerBlock` below are constrained to what's registered (see
 * SurfaceGenerator) — temperate biomes fall back to Grass/Dirt and
 * Desert falls back to Sand, matching Beta's own convention (Desert is
 * the only *reachable* biome that overrides to Sand as both top and
 * filler in the original source's static initializer).
 */
export interface BiomeDefinition {
  readonly id: BiomeId;
  readonly displayName: string;
  /** Block placed at the surface (e.g. Grass, Sand). */
  readonly topBlock: BlockId;
  /** Block placed in the layers just below the surface (e.g. Dirt, Sand). */
  readonly fillerBlock: BlockId;
  /**
   * Beta 1.7.3 BiomeGenBase.enableSnow.
   * True for biomes where snow falls and water freezes (Taiga, Tundra).
   * False for all other biomes.
   */
  readonly enableSnow: boolean;
  /** Configurable final-look inputs; no original Beta colourizer tables. */
  readonly vegetationTints: Readonly<Record<'grass' | 'oakLeaves' | 'birchLeaves' | 'spruceLeaves', readonly [number, number, number]>>;
  readonly vegetationTintStrengths: Readonly<Record<'grass' | 'oakLeaves' | 'birchLeaves' | 'spruceLeaves', number>>;
  /** Beta-inspired decoration count adjustment and weighted generator IDs. */
  readonly treeDensity: number;
  readonly treeGenerators: readonly { readonly kind: 'oak' | 'bigOak' | 'birch' | 'spruce' | 'tallSpruce'; readonly weight: number }[];
}

export const BIOMES: Readonly<Record<BiomeId, BiomeDefinition>> = {
  rainforest: {
    id: 'rainforest',
    displayName: 'Rainforest',
    topBlock: BlockIds.Grass,
    fillerBlock: BlockIds.Dirt,

    vegetationTints: { grass: [0x62/255,0xb9/255,0x4a/255], oakLeaves: [0x62/255,0xb9/255,0x4a/255], birchLeaves: [0x62/255,0xb9/255,0x4a/255], spruceLeaves: [0x61/255,0x9b/255,0x43/255] },
    vegetationTintStrengths: { grass: 0.6, oakLeaves: 0.6, birchLeaves: 0.5, spruceLeaves: 0.25 },
    treeDensity: 5,
    treeGenerators: [{ kind: 'bigOak', weight: 1 }, { kind: 'oak', weight: 2 }],
    enableSnow: false,
  },
  swampland: {
    id: 'swampland',
    displayName: 'Swampland',
    topBlock: BlockIds.Grass,
    fillerBlock: BlockIds.Dirt,

    vegetationTints: { grass: [0x6a/255,0xc0/255,0x42/255], oakLeaves: [0x6a/255,0xc0/255,0x42/255], birchLeaves: [0x6a/255,0xc0/255,0x42/255], spruceLeaves: [0x61/255,0x9b/255,0x43/255] },
    vegetationTintStrengths: { grass: 0.6, oakLeaves: 0.6, birchLeaves: 0.5, spruceLeaves: 0.25 },
    treeDensity: 0,
    treeGenerators: [{ kind: 'oak', weight: 1 }],
    enableSnow: false,
  },
  seasonalForest: {
    id: 'seasonalForest',
    displayName: 'Seasonal Forest',
    topBlock: BlockIds.Grass,
    fillerBlock: BlockIds.Dirt,

    vegetationTints: { grass: [0x79/255,0xc0/255,0x5a/255], oakLeaves: [0x79/255,0xc0/255,0x5a/255], birchLeaves: [0x79/255,0xc0/255,0x5a/255], spruceLeaves: [0x61/255,0x9b/255,0x43/255] },
    vegetationTintStrengths: { grass: 0.6, oakLeaves: 0.6, birchLeaves: 0.5, spruceLeaves: 0.25 },
    treeDensity: 2,
    treeGenerators: [{ kind: 'oak', weight: 1 }],
    enableSnow: false,
  },
  forest: {
    id: 'forest',
    displayName: 'Forest',
    topBlock: BlockIds.Grass,
    fillerBlock: BlockIds.Dirt,

    vegetationTints: { grass: [0x72/255,0xbd/255,0x52/255], oakLeaves: [0x72/255,0xbd/255,0x52/255], birchLeaves: [0x72/255,0xbd/255,0x52/255], spruceLeaves: [0x61/255,0x9b/255,0x43/255] },
    vegetationTintStrengths: { grass: 0.6, oakLeaves: 0.6, birchLeaves: 0.5, spruceLeaves: 0.25 },
    treeDensity: 5,
    treeGenerators: [{ kind: 'birch', weight: 3 }, { kind: 'bigOak', weight: 4 }, { kind: 'oak', weight: 8 }],
    enableSnow: false,
  },
  savanna: {
    id: 'savanna',
    displayName: 'Savanna',
    topBlock: BlockIds.Grass,
    fillerBlock: BlockIds.Dirt,

    vegetationTints: { grass: [0x8c/255,0xbc/255,0x54/255], oakLeaves: [0x8c/255,0xbc/255,0x54/255], birchLeaves: [0x8c/255,0xbc/255,0x54/255], spruceLeaves: [0x61/255,0x9b/255,0x43/255] },
    vegetationTintStrengths: { grass: 0.6, oakLeaves: 0.6, birchLeaves: 0.5, spruceLeaves: 0.25 },
    treeDensity: 0,
    treeGenerators: [{ kind: 'oak', weight: 1 }],
    enableSnow: false,
  },
  shrubland: {
    id: 'shrubland',
    displayName: 'Shrubland',
    topBlock: BlockIds.Grass,
    fillerBlock: BlockIds.Dirt,

    vegetationTints: { grass: [0x82/255,0xb8/255,0x55/255], oakLeaves: [0x82/255,0xb8/255,0x55/255], birchLeaves: [0x82/255,0xb8/255,0x55/255], spruceLeaves: [0x61/255,0x9b/255,0x43/255] },
    vegetationTintStrengths: { grass: 0.6, oakLeaves: 0.6, birchLeaves: 0.5, spruceLeaves: 0.25 },
    treeDensity: 0,
    treeGenerators: [{ kind: 'oak', weight: 1 }],
    enableSnow: false,
  },
  taiga: {
    id: 'taiga',
    displayName: 'Taiga',
    topBlock: BlockIds.Grass,
    fillerBlock: BlockIds.Dirt,

    vegetationTints: { grass: [0x6d/255,0x9d/255,0x5b/255], oakLeaves: [0x6d/255,0x9d/255,0x5b/255], birchLeaves: [0x6d/255,0x9d/255,0x5b/255], spruceLeaves: [0x61/255,0x9b/255,0x43/255] },
    vegetationTintStrengths: { grass: 0.6, oakLeaves: 0.6, birchLeaves: 0.5, spruceLeaves: 0.25 },
    treeDensity: 5,
    treeGenerators: [{ kind: 'tallSpruce', weight: 1 }, { kind: 'spruce', weight: 2 }],
    enableSnow: true,
  },
  desert: {
    id: 'desert',
    displayName: 'Desert',
    topBlock: BlockIds.Sand,
    fillerBlock: BlockIds.Sand,

    vegetationTints: { grass: [0x9f/255,0xb6/255,0x62/255], oakLeaves: [0x9f/255,0xb6/255,0x62/255], birchLeaves: [0x9f/255,0xb6/255,0x62/255], spruceLeaves: [0x61/255,0x9b/255,0x43/255] },
    vegetationTintStrengths: { grass: 0.6, oakLeaves: 0.6, birchLeaves: 0.5, spruceLeaves: 0.25 },
    treeDensity: -20,
    treeGenerators: [],
    enableSnow: false,
  },
  plains: {
    id: 'plains',
    displayName: 'Plains',
    topBlock: BlockIds.Grass,
    fillerBlock: BlockIds.Dirt,

    vegetationTints: { grass: [0x79/255,0xc0/255,0x5a/255], oakLeaves: [0x79/255,0xc0/255,0x5a/255], birchLeaves: [0x79/255,0xc0/255,0x5a/255], spruceLeaves: [0x61/255,0x9b/255,0x43/255] },
    vegetationTintStrengths: { grass: 0.6, oakLeaves: 0.6, birchLeaves: 0.5, spruceLeaves: 0.25 },
    treeDensity: -20,
    treeGenerators: [],
    enableSnow: false,
  },
  tundra: {
    id: 'tundra',
    displayName: 'Tundra',
    topBlock: BlockIds.Grass,
    fillerBlock: BlockIds.Dirt,

    vegetationTints: { grass: [0x80/255,0xaa/255,0x72/255], oakLeaves: [0x80/255,0xaa/255,0x72/255], birchLeaves: [0x80/255,0xaa/255,0x72/255], spruceLeaves: [0x61/255,0x9b/255,0x43/255] },
    vegetationTintStrengths: { grass: 0.6, oakLeaves: 0.6, birchLeaves: 0.5, spruceLeaves: 0.25 },
    treeDensity: -20,
    treeGenerators: [],
    enableSnow: true,
  },
};
