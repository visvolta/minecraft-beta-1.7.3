import { ClimateSampler } from './climate/ClimateSampler';
import { selectBiome } from './climate/BiomeSelector';
import type { BiomeId } from './climate/biomes';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../chunkConstants';
import { CHUNK_LOAD_RADIUS } from '../ChunkStreamer';

/** Matches the game's actual chunk streaming radius around the player (see ChunkStreamer). */
const DEFAULT_HEALTH_CHECK_RADIUS_CHUNKS = CHUNK_LOAD_RADIUS;

/**
 * Guards against picking a pathological world seed (one that's
 * technically correct but produces an overwhelmingly single-biome
 * world). This exact failure mode is what motivated this check: seed
 * 12345 was previously the default and, verified against compiled
 * mc-dev, genuinely produces ~83% Desert in real Beta — authentic
 * behaviour for that seed, but a poor default for this project. This
 * does not test generation *correctness* (that's covered by exact JVM
 * comparisons elsewhere); it only flags "this seed happens to look bad".
 */
export interface BiomeHealthResult {
  readonly seed: bigint;
  readonly sampleAreaChunks: number;
  readonly totalColumns: number;
  readonly distinctBiomeCount: number;
  readonly maxSingleBiomeFraction: number;
  readonly maxSingleBiomeId: BiomeId;
  readonly counts: Readonly<Record<BiomeId, number>>;
  readonly healthy: boolean;
}

/**
 * A single biome covering more than this fraction of sampled columns
 * (within DEFAULT_HEALTH_CHECK_RADIUS_CHUNKS of spawn) is considered
 * unhealthy. Calibrated against real data: the previous pathological
 * default seed (12345) hits ~90% at this radius, while several verified
 * healthy seeds land in the ~27-38% range — 0.6 sits with a wide safety
 * margin between the two.
 */
export const MAX_SINGLE_BIOME_FRACTION = 0.6;

/** Fewer than this many distinct biomes appearing is considered unhealthy. */
export const MIN_DISTINCT_BIOMES = 3;

/**
 * Samples climate/biome over a square area of `radiusChunks` around the
 * origin chunk and reports whether the resulting biome distribution looks
 * healthy (no single biome dominating, reasonable variety).
 *
 * Defaults to a radius matching the game's actual chunk streaming radius
 * around spawn (see world/ChunkStreamer's CHUNK_LOAD_RADIUS). This
 * matters: biome distribution for a pathological seed can look fine when
 * averaged over a very large area far from spawn, while still being
 * badly monotonous in the region the player actually starts in and can
 * initially see/explore — which is exactly what this check needs to
 * catch. Verified against a known-pathological seed (12345): at this
 * radius it shows 90%+ single-biome dominance, clearly separated from a
 * healthy seed's ~27-37% at the same radius.
 */
export function checkBiomeHealth(worldSeed: bigint, radiusChunks = DEFAULT_HEALTH_CHECK_RADIUS_CHUNKS): BiomeHealthResult {
  const sampler = new ClimateSampler(worldSeed);
  const counts: Partial<Record<BiomeId, number>> = {};
  let totalColumns = 0;

  for (let chunkX = -radiusChunks; chunkX <= radiusChunks; chunkX++) {
    for (let chunkZ = -radiusChunks; chunkZ <= radiusChunks; chunkZ++) {
      const climate = sampler.sampleRegion(
        chunkX * CHUNK_SIZE_X,
        chunkZ * CHUNK_SIZE_Z,
        CHUNK_SIZE_X,
        CHUNK_SIZE_Z,
      );

      for (const sample of climate) {
        const biome = selectBiome(sample);
        counts[biome.id] = (counts[biome.id] ?? 0) + 1;
        totalColumns++;
      }
    }
  }

  let maxSingleBiomeId: BiomeId | null = null;
  let maxCount = 0;

  for (const [id, count] of Object.entries(counts) as Array<[BiomeId, number]>) {
    if (count > maxCount) {
      maxCount = count;
      maxSingleBiomeId = id;
    }
  }

  const distinctBiomeCount = Object.keys(counts).length;
  const maxSingleBiomeFraction = totalColumns > 0 ? maxCount / totalColumns : 0;
  const healthy =
    maxSingleBiomeFraction <= MAX_SINGLE_BIOME_FRACTION &&
    distinctBiomeCount >= MIN_DISTINCT_BIOMES;

  return {
    seed: worldSeed,
    sampleAreaChunks: (radiusChunks * 2 + 1) ** 2,
    totalColumns,
    distinctBiomeCount,
    maxSingleBiomeFraction,
    // Non-null: at least one biome is always selected for any climate sample.
    maxSingleBiomeId: maxSingleBiomeId as BiomeId,
    counts: counts as Record<BiomeId, number>,
    healthy,
  };
}
