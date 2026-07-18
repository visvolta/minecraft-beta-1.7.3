import type { BiomeDefinition, BiomeId } from './biomes';
import { BlockIds } from '../../../blocks/BlockId';
import type { BlockId } from '../../../blocks/BlockId';
import type { BlockFace } from '../../../blocks/BlockFace';
import { ClimateSampler } from './ClimateSampler';
import { selectBiome } from './BiomeSelector';

export type VegetationKind = 'grass' | 'oakLeaves' | 'birchLeaves' | 'spruceLeaves';
export type Rgb = readonly [number, number, number];

/** Deliberately editable Beta-inspired defaults; no colourizer lookup is used. */
export const VEGETATION_BASE_COLORS: Readonly<Record<VegetationKind, Rgb>> = {
  grass: [0x79 / 255, 0xc0 / 255, 0x5a / 255],
  oakLeaves: [0x4e / 255, 0xe0 / 255, 0x31 / 255],
  birchLeaves: [0x68 / 255, 0xbf / 255, 0x4c / 255],
  spruceLeaves: [0x61 / 255, 0x9b / 255, 0x43 / 255],
};


/** Rendering contract: grass-side pixels include dirt and must never receive biome tint. */
export function vegetationTintKind(blockId: BlockId, face: BlockFace): VegetationKind | undefined {
  if (blockId === BlockIds.TallGrass) return 'grass';
  if (blockId === BlockIds.Grass) return face === 'top' ? 'grass' : undefined;
  if (blockId === BlockIds.Leaves) return 'oakLeaves';
  if (blockId === BlockIds.BirchLeaves) return 'birchLeaves';
  if (blockId === BlockIds.SpruceLeaves) return 'spruceLeaves';
  return undefined;
}

export interface VegetationTintOverrides {
  readonly grass?: number;
  readonly oakLeaves?: number;
  readonly birchLeaves?: number;
  readonly spruceLeaves?: number;
}

function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }

export function blendVegetationColor(base: Rgb, tint: Rgb, strength: number): Rgb {
  const t = clamp01(strength);
  return [base[0] + (tint[0] - base[0]) * t, base[1] + (tint[1] - base[1]) * t, base[2] + (tint[2] - base[2]) * t];
}

/** Pure deterministic biome colour lookup shared by main-thread and worker meshing. */
export class VegetationColorProvider {
  private readonly climate: ClimateSampler;
  private overrides: VegetationTintOverrides = {};
  public constructor(seed: bigint) { this.climate = new ClimateSampler(seed); }
  public getBiomeAt(x: number, z: number): BiomeDefinition {
    return selectBiome(this.climate.sampleRegion(x, z, 1, 1)[0]!);
  }
  public getColorAt(kind: VegetationKind, x: number, z: number): Rgb {
    const biome = this.getBiomeAt(x, z);
    return this.getColorForBiome(kind, biome);
  }
  public getColorForBiome(kind: VegetationKind, biome: BiomeDefinition): Rgb {
    const base = VEGETATION_BASE_COLORS[kind];
    const key = kind === 'grass' ? 'grass' : kind;
    const tint = biome.vegetationTints[key];
    const strength = this.overrides[key] ?? biome.vegetationTintStrengths[key];
    return blendVegetationColor(base, tint, strength);
  }
  public setOverrides(overrides: VegetationTintOverrides): void { this.overrides = { ...this.overrides, ...overrides }; }
  public getOverrides(): VegetationTintOverrides { return this.overrides; }
}

export function activeBiomeIds(): readonly BiomeId[] { return ['rainforest','swampland','seasonalForest','forest','savanna','shrubland','taiga','desert','plains','tundra']; }
