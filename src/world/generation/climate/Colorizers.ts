/**
 * Beta 1.7.3 grass / foliage colorizers.
 *
 * Ports ColorizerGrass / ColorizerFoliage lookup math against the official
 * grasscolor.png / foliagecolor.png tables (embedded as generated Uint32
 * 0xRRGGBB buffers). No biome-border blending — Beta samples one climate
 * column per block.
 */

import { FOLIAGE_COLORIZER_TABLE, GRASS_COLORIZER_TABLE } from './colorizerTables.generated.ts';

export type Rgb = readonly [number, number, number];

/** Beta ColorizerFoliage.getFoliageColorPine() = 6396257. */
export const PINE_FOLIAGE_COLOR = 6396257;
/** Beta ColorizerFoliage.getFoliageColorBirch() = 8431445. */
export const BIRCH_FOLIAGE_COLOR = 8431445;
/** Beta ColorizerFoliage.getFoliageColorBasic() = 4764952. */
export const BASIC_FOLIAGE_COLOR = 4764952;

/**
 * Intentional Old Growth Spruce Taiga climate used only for colorizer sampling.
 * Documented extension — not a Beta biome. Matches modern OGST temp/downfall
 * ballpark so the biome reads cold-wet under the same pipeline.
 */
export const OGST_COLORIZER_TEMPERATURE = 0.25;
export const OGST_COLORIZER_HUMIDITY = 0.8;

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function packedToRgb(packed: number): Rgb {
  const r = ((packed >> 16) & 0xff) / 255;
  const g = ((packed >> 8) & 0xff) / 255;
  const b = (packed & 0xff) / 255;
  return [r, g, b];
}

function sampleTable(table: Uint32Array, temperature: number, humidity: number): Rgb {
  const t = clamp01(temperature);
  const h = clamp01(humidity) * t;
  const x = Math.floor((1 - t) * 255);
  const y = Math.floor((1 - h) * 255);
  const index = (y << 8) | x;
  return packedToRgb(table[index] ?? 0xffffff);
}

/** ColorizerGrass.getGrassColor(temp, humidity). */
export function getGrassColor(temperature: number, humidity: number): Rgb {
  return sampleTable(GRASS_COLORIZER_TABLE, temperature, humidity);
}

/** ColorizerFoliage.getFoliageColor(temp, humidity) — oak / default leaves. */
export function getFoliageColor(temperature: number, humidity: number): Rgb {
  return sampleTable(FOLIAGE_COLORIZER_TABLE, temperature, humidity);
}

export function getPineFoliageColor(): Rgb {
  return packedToRgb(PINE_FOLIAGE_COLOR);
}

export function getBirchFoliageColor(): Rgb {
  return packedToRgb(BIRCH_FOLIAGE_COLOR);
}

export function getBasicFoliageColor(): Rgb {
  return packedToRgb(BASIC_FOLIAGE_COLOR);
}
