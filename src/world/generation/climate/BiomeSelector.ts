import type { BiomeDefinition } from './biomes';
import { BIOMES } from './biomes';
import type { ClimateSample } from './ClimateSampler';

/**
 * Faithful port of Beta 1.7.3's MobSpawnerBase.a(float temperature, float
 * humidity) decision tree (a hand-tuned tree, not smooth blending).
 *
 * Research note: in the original source, humidity is first multiplied by
 * temperature (`f2 *= f1`) before the tree is evaluated. The tree as
 * written never returns Ice Desert — every branch that could plausibly
 * reach it instead resolves to Desert, Tundra, or another biome. This
 * was verified directly against compiled, unmodified mc-dev source and
 * independently corroborated by Project-Poseidon's BiomeBase (which
 * implements the identical tree). Ice Desert is therefore intentionally
 * absent from biomes.ts entirely, not just unreachable here.
 */
export function selectBiome(sample: ClimateSample): BiomeDefinition {
  const temperature = sample.temperature;
  const humidity = sample.humidity * sample.temperature;

  if (temperature < 0.1) {
    return BIOMES.tundra;
  }

  if (humidity < 0.2) {
    if (temperature < 0.5) {
      return BIOMES.tundra;
    }

    if (temperature < 0.95) {
      return BIOMES.savanna;
    }

    return BIOMES.desert;
  }

  if (humidity > 0.5 && temperature < 0.7) {
    return BIOMES.swampland;
  }

  if (temperature < 0.5) {
    return BIOMES.taiga;
  }

  if (temperature < 0.97) {
    if (humidity < 0.35) {
      return BIOMES.shrubland;
    }

    return BIOMES.forest;
  }

  if (humidity < 0.45) {
    return BIOMES.plains;
  }

  if (humidity < 0.9) {
    return BIOMES.seasonalForest;
  }

  return BIOMES.rainforest;
}
