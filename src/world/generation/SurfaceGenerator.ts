import { BlockIds } from '../../blocks/BlockId';
import type { BlockId } from '../../blocks/BlockId';
import { JavaRandom } from './random/JavaRandom';
import type { OctaveNoise } from './noise/OctaveNoise';
import type { ClimateSample } from './climate/ClimateSampler';
import { selectBiome } from './climate/BiomeSelector';
import { RAW_AIR, RAW_STONE } from './BetaTerrainGenerator';
import { SEA_LEVEL, SURFACE_NOISE_SCALE, GRAVEL_NOISE_FIXED_PLANE } from './terrainConstants';
import { CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z } from '../chunkConstants';

/** Per-chunk seed scramble constants, from ChunkProviderGenerate.b(i,j). */
const CHUNK_SEED_MULTIPLIER_X = 0x4f9939f508n;
const CHUNK_SEED_MULTIPLIER_Z = 0x1ef1565bd5n;

/** Sea-level band bedrock/sand/gravel decisions apply within (byte0-4 .. byte0+1). */
const SURFACE_BAND_BELOW = 4;
const SURFACE_BAND_ABOVE = 1;

/** Max random extra bedrock layers above Y=0 (jagged bedrock floor, not a flat layer). */
const MAX_RANDOM_BEDROCK_LAYERS = 5;

/**
 * Faithful port of Beta 1.7.3's ChunkProviderGenerate surface-replacement
 * pass: walks each column top-down over the raw Stone/Water/Air terrain,
 * placing bedrock near the bottom and biome-driven top/filler blocks near
 * the surface, plus sand/gravel patch overrides.
 *
 * Operates only on the closed, known raw block vocabulary that
 * BetaTerrainGenerator itself writes (Stone / Water / Air) — it does not
 * consult BlockRegistry's `solid`/`replaceable` gameplay flags, since
 * those describe gameplay behaviour, not terrain-generation rules.
 *
 * Deliberate deviation from Beta, disclosed: the small supplementary
 * "smooth beach edges using a neighbour-offset noise sample" pass that
 * real Beta runs during chunk *decoration* (population), which reads
 * already-populated neighbouring chunks and is therefore population-order
 * dependent, is not ported — this project requires generation to be
 * independent of chunk generation order. The primary per-column
 * sand/gravel-patch mechanic (implemented here) already produces Beta's
 * characteristic beach texture; only that secondary smoothing pass is
 * omitted.
 */
export class SurfaceGenerator {
  private readonly random: JavaRandom;
  private readonly sandPatchNoise: OctaveNoise; // Beta's `n`
  private readonly depthPatchNoise: OctaveNoise; // Beta's `o`

  public constructor(random: JavaRandom, sandPatchNoise: OctaveNoise, depthPatchNoise: OctaveNoise) {
    this.random = random;
    this.sandPatchNoise = sandPatchNoise;
    this.depthPatchNoise = depthPatchNoise;
  }

  /**
   * Applies bedrock + biome surface replacement to `blocks` (mutated in
   * place), matching ChunkProviderGenerate's two-argument `a(...)`
   * surface method exactly, including its per-chunk Random reseed.
   */
  public apply(chunkX: number, chunkZ: number, blocks: Uint8Array, climate: ClimateSample[]): void {
    // Matches ChunkProviderGenerate.b(i1,j1)'s per-chunk reseed, which
    // runs before both the density and surface passes in real Beta.
    const chunkSeed =
      BigInt(chunkX) * CHUNK_SEED_MULTIPLIER_X + BigInt(chunkZ) * CHUNK_SEED_MULTIPLIER_Z;
    this.random.setSeed(chunkSeed);

    const sandPatch = this.sandPatchNoise.fillArray(
      chunkX * CHUNK_SIZE_X,
      chunkZ * CHUNK_SIZE_Z,
      0,
      CHUNK_SIZE_X,
      CHUNK_SIZE_Z,
      1,
      SURFACE_NOISE_SCALE,
      SURFACE_NOISE_SCALE,
      1,
    );
    // Gravel-patch noise reuses the sand-patch generator with swapped
    // X/Z axes and a fixed Y-plane, exactly matching Beta's
    // `n.a(s, j1*16, 109.0134D, i1*16, 16, 1, 16, d1, 1.0D, d1)`.
    const gravelPatch = this.sandPatchNoise.fillArray(
      chunkZ * CHUNK_SIZE_Z,
      GRAVEL_NOISE_FIXED_PLANE,
      chunkX * CHUNK_SIZE_X,
      CHUNK_SIZE_Z,
      1,
      CHUNK_SIZE_X,
      SURFACE_NOISE_SCALE,
      1,
      SURFACE_NOISE_SCALE,
    );
    const surfaceDepthNoise = this.depthPatchNoise.fillArray(
      chunkX * CHUNK_SIZE_X,
      chunkZ * CHUNK_SIZE_Z,
      0,
      CHUNK_SIZE_X,
      CHUNK_SIZE_Z,
      1,
      SURFACE_NOISE_SCALE * 2,
      SURFACE_NOISE_SCALE * 2,
      1,
    );

    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        const columnIndex = x + z * CHUNK_SIZE_X;
        const biome = selectBiome(climate[columnIndex]!);

        const isSandPatch = sandPatch[columnIndex]! + this.random.nextDouble() * 0.2 > 0;
        const isGravelPatch = gravelPatch[columnIndex]! + this.random.nextDouble() * 0.2 > 3;
        const surfaceDepth = Math.trunc(
          surfaceDepthNoise[columnIndex]! / 3 + 3 + this.random.nextDouble() * 0.25,
        );

        let remainingFillerDepth = -1;
        let topBlock: BlockId = biome.topBlock;
        let fillerBlock: BlockId = biome.fillerBlock;

        for (let y = CHUNK_SIZE_Y - 1; y >= 0; y--) {
          const index = this.blockIndex(x, y, z);

          if (y <= this.random.nextInt(MAX_RANDOM_BEDROCK_LAYERS)) {
            blocks[index] = BlockIds.Bedrock;
            continue;
          }

          const existing = blocks[index]!;

          if (existing === RAW_AIR) {
            remainingFillerDepth = -1;
            continue;
          }

          if (existing !== RAW_STONE) {
            continue;
          }

          if (remainingFillerDepth === -1) {
            if (surfaceDepth <= 0) {
              topBlock = RAW_AIR as BlockId;
              fillerBlock = RAW_STONE;
            } else if (y >= SEA_LEVEL - SURFACE_BAND_BELOW && y <= SEA_LEVEL + SURFACE_BAND_ABOVE) {
              topBlock = biome.topBlock;
              fillerBlock = biome.fillerBlock;

              if (isGravelPatch) {
                topBlock = RAW_AIR as BlockId;
                fillerBlock = BlockIds.Gravel;
              }

              if (isSandPatch) {
                topBlock = BlockIds.Sand;
                fillerBlock = BlockIds.Sand;
              }
            }

            if (y < SEA_LEVEL && topBlock === RAW_AIR) {
              topBlock = BlockIds.Water;
            }

            remainingFillerDepth = surfaceDepth;

            blocks[index] = y >= SEA_LEVEL - 1 ? topBlock : fillerBlock;
            continue;
          }

          if (remainingFillerDepth > 0) {
            remainingFillerDepth--;
            blocks[index] = fillerBlock;
          }
        }
      }
    }
  }

  /** Matches Chunk's own XZY flat-index convention (x fastest, then z, then y). */
  private blockIndex(x: number, y: number, z: number): number {
    return x + z * CHUNK_SIZE_X + y * CHUNK_SIZE_X * CHUNK_SIZE_Z;
  }
}
