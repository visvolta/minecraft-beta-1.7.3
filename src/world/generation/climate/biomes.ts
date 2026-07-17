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
}

export const BIOMES: Readonly<Record<BiomeId, BiomeDefinition>> = {
  rainforest: {
    id: 'rainforest',
    displayName: 'Rainforest',
    topBlock: BlockIds.Grass,
    fillerBlock: BlockIds.Dirt,
    enableSnow: false,
  },
  swampland: {
    id: 'swampland',
    displayName: 'Swampland',
    topBlock: BlockIds.Grass,
    fillerBlock: BlockIds.Dirt,
    enableSnow: false,
  },
  seasonalForest: {
    id: 'seasonalForest',
    displayName: 'Seasonal Forest',
    topBlock: BlockIds.Grass,
    fillerBlock: BlockIds.Dirt,
    enableSnow: false,
  },
  forest: {
    id: 'forest',
    displayName: 'Forest',
    topBlock: BlockIds.Grass,
    fillerBlock: BlockIds.Dirt,
    enableSnow: false,
  },
  savanna: {
    id: 'savanna',
    displayName: 'Savanna',
    topBlock: BlockIds.Grass,
    fillerBlock: BlockIds.Dirt,
    enableSnow: false,
  },
  shrubland: {
    id: 'shrubland',
    displayName: 'Shrubland',
    topBlock: BlockIds.Grass,
    fillerBlock: BlockIds.Dirt,
    enableSnow: false,
  },
  taiga: {
    id: 'taiga',
    displayName: 'Taiga',
    topBlock: BlockIds.Grass,
    fillerBlock: BlockIds.Dirt,
    enableSnow: true,
  },
  desert: {
    id: 'desert',
    displayName: 'Desert',
    topBlock: BlockIds.Sand,
    fillerBlock: BlockIds.Sand,
    enableSnow: false,
  },
  plains: {
    id: 'plains',
    displayName: 'Plains',
    topBlock: BlockIds.Grass,
    fillerBlock: BlockIds.Dirt,
    enableSnow: false,
  },
  tundra: {
    id: 'tundra',
    displayName: 'Tundra',
    topBlock: BlockIds.Grass,
    fillerBlock: BlockIds.Dirt,
    enableSnow: true,
  },
};
