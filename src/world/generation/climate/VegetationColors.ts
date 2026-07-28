import type { BiomeDefinition, BiomeId } from './biomes';
import { BlockIds } from '../../../blocks/BlockId';
import type { BlockId } from '../../../blocks/BlockId';
import type { BlockFace } from '../../../blocks/BlockFace';
import { ClimateSampler } from './ClimateSampler';
import { selectBiome } from './BiomeSelector';
import {
  getBirchFoliageColor,
  getFoliageColor,
  getGrassColor,
  getPineFoliageColor,
  OGST_COLORIZER_HUMIDITY,
  OGST_COLORIZER_TEMPERATURE,
  type Rgb,
} from './Colorizers';
import { isOldGrowthSpruceTaigaColumn } from './OldGrowthSpruceTaiga';
import { TALL_GRASS_META_DEAD, TALL_GRASS_META_FERN } from '../../../blocks/TallGrassMeta';

export type VegetationKind = 'grass' | 'oakLeaves' | 'birchLeaves' | 'spruceLeaves';
export type { Rgb };

/** Fallback bases only used when colorizer path is unavailable (should not happen). */
export const VEGETATION_BASE_COLORS: Readonly<Record<VegetationKind, Rgb>> = {
  grass: [0x79 / 255, 0xc0 / 255, 0x5a / 255],
  oakLeaves: [0x4e / 255, 0xee / 255, 0x31 / 255],
  birchLeaves: [0x80 / 255, 0xa7 / 255, 0x55 / 255],
  spruceLeaves: [0x61 / 255, 0x99 / 255, 0x41 / 255],
};

/**
 * Rendering contract:
 * - Grass block top is tinted; sides include dirt and must not receive biome tint.
 * - Tall grass meta 0 (dead look) is untinted white (Beta).
 * - Tall grass meta 1 / fern meta 2 use grass colorizer.
 * - Oak leaves climate foliage; spruce fixed pine; birch fixed birch.
 */
export function vegetationTintKind(
  blockId: BlockId,
  face: BlockFace,
  metadata = 0,
): VegetationKind | 'untinted' | undefined {
  if (blockId === BlockIds.TallGrass) {
    const meta = metadata & 0xf;
    if (meta === TALL_GRASS_META_DEAD) return 'untinted';
    return 'grass';
  }
  if (blockId === BlockIds.Grass) return face === 'top' ? 'grass' : undefined;
  if (blockId === BlockIds.Leaves) return 'oakLeaves';
  if (blockId === BlockIds.BirchLeaves) return 'birchLeaves';
  if (blockId === BlockIds.SpruceLeaves) return 'spruceLeaves';
  return undefined;
}

/** @deprecated retained for validateTrees blend unit checks */
export function blendVegetationColor(base: Rgb, tint: Rgb, strength: number): Rgb {
  const t = Math.max(0, Math.min(1, strength));
  return [
    base[0] + (tint[0] - base[0]) * t,
    base[1] + (tint[1] - base[1]) * t,
    base[2] + (tint[2] - base[2]) * t,
  ];
}

/**
 * Pure deterministic biome colour lookup shared by main-thread and worker meshing.
 * Uses Beta colorizer tables. OGST columns force the documented extension climate.
 */
export class VegetationColorProvider {
  private readonly climate: ClimateSampler;
  private readonly worldSeed: bigint;
  /** Per-column climate cache for a single mesh build (cleared each job). */
  private readonly columnCache = new Map<number, { temperature: number; humidity: number }>();

  public constructor(seed: bigint) {
    this.worldSeed = seed;
    this.climate = new ClimateSampler(seed);
  }

  /** Call at the start of each chunk mesh build. */
  public beginMeshBuild(): void {
    this.columnCache.clear();
  }

  public getBiomeAt(x: number, z: number): BiomeDefinition {
    return selectBiome(this.climate.sampleRegion(x, z, 1, 1)[0]!);
  }

  public getColorAt(kind: VegetationKind, x: number, z: number): Rgb {
    const key = (x | 0) * 73856093 + (z | 0) * 19349663;
    let climate = this.columnCache.get(key);
    if (climate === undefined) {
      const sample = this.climate.sampleRegion(x, z, 1, 1)[0]!;
      const biome = selectBiome(sample);
      let temperature = sample.temperature;
      let humidity = sample.humidity;
      if (biome.id === 'taiga' && isOldGrowthSpruceTaigaColumn(this.worldSeed, x, z)) {
        temperature = OGST_COLORIZER_TEMPERATURE;
        humidity = OGST_COLORIZER_HUMIDITY;
      }
      climate = { temperature, humidity };
      this.columnCache.set(key, climate);
    }
    return this.colorForKind(kind, climate.temperature, climate.humidity);
  }

  public getColorForBiome(kind: VegetationKind, biome: BiomeDefinition): Rgb {
    // Approximate mid climate per biome name for debug UIs only.
    void biome;
    return this.colorForKind(kind, 0.7, 0.5);
  }

  private colorForKind(kind: VegetationKind, temperature: number, humidity: number): Rgb {
    switch (kind) {
      case 'grass':
        return getGrassColor(temperature, humidity);
      case 'oakLeaves':
        return getFoliageColor(temperature, humidity);
      case 'birchLeaves':
        return getBirchFoliageColor();
      case 'spruceLeaves':
        return getPineFoliageColor();
      default:
        return VEGETATION_BASE_COLORS.grass;
    }
  }

  /** Fern uses grass colorizer (Beta BlockTallGrass meta 2). */
  public getFernColorAt(x: number, z: number): Rgb {
    return this.getColorAt('grass', x, z);
  }
}

export function activeBiomeIds(): readonly BiomeId[] {
  return [
    'rainforest',
    'swampland',
    'seasonalForest',
    'forest',
    'savanna',
    'shrubland',
    'taiga',
    'desert',
    'plains',
    'tundra',
  ];
}

export { TALL_GRASS_META_FERN };
