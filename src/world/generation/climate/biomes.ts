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
}

export const BIOMES: Readonly<Record<BiomeId, BiomeDefinition>> = {
  rainforest: {
    id: 'rainforest',
    displayName: 'Rainforest',
    topBlock: BlockIds.Grass,
    fillerBlock: BlockIds.Dirt,
  },
  swampland: {
    id: 'swampland',
    displayName: 'Swampland',
    topBlock: BlockIds.Grass,
    fillerBlock: BlockIds.Dirt,
  },
  seasonalForest: {
    id: 'seasonalForest',
    displayName: 'Seasonal Forest',
    topBlock: BlockIds.Grass,
    fillerBlock: BlockIds.Dirt,
  },
  forest: {
    id: 'forest',
    displayName: 'Forest',
    topBlock: BlockIds.Grass,
    fillerBlock: BlockIds.Dirt,
  },
  savanna: {
    id: 'savanna',
    displayName: 'Savanna',
    // Real Beta 1.7.3: MobSpawnerDesert-derived, but does not override
    // o/p, so it keeps the MobSpawnerBase default (Grass/Dirt) — only
    // Desert (reachable) and Ice Desert (unreachable) override to Sand.
    // Verified from source: only `h` (Desert) and `j` (Ice Desert) get
    // `.o = .p = Block.E` (Sand).
    topBlock: BlockIds.Grass,
    fillerBlock: BlockIds.Dirt,
  },
  shrubland: {
    id: 'shrubland',
    displayName: 'Shrubland',
    topBlock: BlockIds.Grass,
    fillerBlock: BlockIds.Dirt,
  },
  taiga: {
    id: 'taiga',
    displayName: 'Taiga',
    // Real Beta 1.7.3 Taiga uses plain Grass/Dirt (Podzol is a much later
    // Minecraft addition) — Podzol is registered but never generated here.
    topBlock: BlockIds.Grass,
    fillerBlock: BlockIds.Dirt,
  },
  desert: {
    id: 'desert',
    displayName: 'Desert',
    topBlock: BlockIds.Sand,
    fillerBlock: BlockIds.Sand,
  },
  plains: {
    id: 'plains',
    displayName: 'Plains',
    topBlock: BlockIds.Grass,
    fillerBlock: BlockIds.Dirt,
  },
  tundra: {
    id: 'tundra',
    displayName: 'Tundra',
    topBlock: BlockIds.Grass,
    fillerBlock: BlockIds.Dirt,
  },
};
