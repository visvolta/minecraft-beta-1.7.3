/**
 * Intentional non-Beta extension: Old Growth Spruce Taiga as a taiga sub-biome.
 *
 * Classification is a pure function of (worldSeed, worldX, worldZ). Every
 * system that cares about OGST identity must call into this module only.
 */

import { JavaRandom } from '../random/JavaRandom';
import { OctaveSimplexNoise2D } from '../noise/OctaveSimplexNoise2D';

/** Cell size for coherent patches (blocks). */
const OGST_CELL = 48;
/** Fraction of taiga cells that become OGST (~20%). */
const OGST_CELL_CHANCE = 0.22;

const samplerCache = new Map<string, OctaveSimplexNoise2D>();

function getSampler(worldSeed: bigint): OctaveSimplexNoise2D {
  const key = worldSeed.toString();
  let sampler = samplerCache.get(key);
  if (sampler === undefined) {
    sampler = new OctaveSimplexNoise2D(new JavaRandom(worldSeed ^ 0x4f475354n), 2);
    samplerCache.set(key, sampler);
  }
  return sampler;
}

function cellHash01(seed: bigint, cellX: number, cellZ: number): number {
  // Mix seed + cell coords into [0,1)
  let h =
    Math.imul(cellX | 0, 374761393) +
    Math.imul(cellZ | 0, 668265263) +
    Number(seed & 0xffffffffn);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h >>> 0) % 100000) / 100000;
}

/**
 * Deterministic OGST test at a world block column. Only meaningful when the
 * Beta biome at this column is already taiga — callers must gate on that.
 */
export function isOldGrowthSpruceTaigaColumn(worldSeed: bigint, worldX: number, worldZ: number): boolean {
  const cellX = Math.floor(worldX / OGST_CELL);
  const cellZ = Math.floor(worldZ / OGST_CELL);
  if (cellHash01(worldSeed, cellX, cellZ) >= OGST_CELL_CHANCE) {
    return false;
  }
  // Soft edge: within selected cells, keep interior solid via low-frequency noise.
  const sampler = getSampler(worldSeed);
  const fx = worldX - cellX * OGST_CELL;
  const fz = worldZ - cellZ * OGST_CELL;
  const edge = Math.min(fx, fz, OGST_CELL - 1 - fx, OGST_CELL - 1 - fz);
  if (edge < 4) {
    const [raw] = sampler.fillArray(worldX, worldZ, 1, 1, 0.08, 0.08, 0.5);
    // Drop fringe columns stochastically for natural borders.
    if (((raw ?? 0) + 3) % 1 < 0.35) return false;
  }
  return true;
}

export type TaigaColumnKind = 'taiga' | 'oldGrowthSpruceTaiga';

export function classifyTaigaColumn(worldSeed: bigint, worldX: number, worldZ: number): TaigaColumnKind {
  return isOldGrowthSpruceTaigaColumn(worldSeed, worldX, worldZ) ? 'oldGrowthSpruceTaiga' : 'taiga';
}
