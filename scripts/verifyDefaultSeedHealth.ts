/**
 * Standalone regression check: run with `npx tsx scripts/verifyDefaultSeedHealth.ts`.
 *
 * Confirms the project's default world seed (see engine/Engine.ts's
 * WORLD_SEED) produces a healthy, varied biome distribution rather than
 * being dominated by a single biome. This exact failure mode — a seed
 * that is technically generated correctly but happens to look
 * monotonous — is what previously slipped through: seed 12345 was
 * verified (against compiled, unmodified mc-dev source) to produce
 * ~83% Desert, which is authentic Beta behaviour for that seed but a
 * poor default for this project.
 *
 * This is not a correctness test (exact-match JVM comparisons cover
 * that elsewhere); it only flags "this seed happens to look bad".
 *
 * Kept outside src/ (which tsconfig.json scopes the app's build to) so
 * it never affects the shipped bundle or the app's own type-checking
 * surface, consistent with how this project's other ad hoc verification
 * scripts have been run via tsx rather than a test framework.
 */
import {
  checkBiomeHealth,
  MAX_SINGLE_BIOME_FRACTION,
  MIN_DISTINCT_BIOMES,
} from '../src/world/generation/verifyBiomeHealth';

// Keep in sync with engine/Engine.ts's WORLD_SEED. Not imported directly
// since WORLD_SEED is intentionally a private module-level constant, not
// part of Engine's public surface.
const DEFAULT_WORLD_SEED = 2n;

/** A seed already confirmed pathological, used to sanity-check the checker itself. */
const KNOWN_BAD_SEED = 12345n;

function report(label: string, seed: bigint): ReturnType<typeof checkBiomeHealth> {
  const result = checkBiomeHealth(seed);
  console.log(`\n${label} (seed=${seed}):`);
  console.log(`  sampled ${result.totalColumns} columns over ${result.sampleAreaChunks} chunks`);
  console.log(`  distinct biomes: ${result.distinctBiomeCount}`);
  console.log(
    `  largest single biome: ${result.maxSingleBiomeId} at ${(result.maxSingleBiomeFraction * 100).toFixed(1)}%`,
  );
  console.log(`  healthy: ${result.healthy}`);
  return result;
}

const defaultResult = report('Default world seed', DEFAULT_WORLD_SEED);
const knownBadResult = report('Known-pathological seed (self-check)', KNOWN_BAD_SEED);

let failed = false;

if (!defaultResult.healthy) {
  console.log(
    `\nFAIL: default seed ${DEFAULT_WORLD_SEED} is unhealthy ` +
      `(max single biome ${(defaultResult.maxSingleBiomeFraction * 100).toFixed(1)}% > ` +
      `${MAX_SINGLE_BIOME_FRACTION * 100}%, or fewer than ${MIN_DISTINCT_BIOMES} distinct biomes).`,
  );
  failed = true;
} else {
  console.log(`\nPASS: default seed ${DEFAULT_WORLD_SEED} is healthy.`);
}

// The checker itself should still correctly flag the known-bad seed as
// unhealthy; if it doesn't, the health check's thresholds/logic are
// wrong, not the seed.
if (knownBadResult.healthy) {
  console.log(
    `\nFAIL: checker did not flag known-pathological seed ${KNOWN_BAD_SEED} as unhealthy — ` +
      `the health check itself may be broken.`,
  );
  failed = true;
} else {
  console.log(`PASS: checker correctly flags known-pathological seed ${KNOWN_BAD_SEED} as unhealthy.`);
}

if (failed) {
  process.exit(1);
}
