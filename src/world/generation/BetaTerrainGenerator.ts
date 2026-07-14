import { BlockIds } from '../../blocks/BlockId';
import { JavaRandom } from './random/JavaRandom';
import { OctaveNoise } from './noise/OctaveNoise';
import { ClimateSampler } from './climate/ClimateSampler';
import type { ClimateSample } from './climate/ClimateSampler';
import {
  DENSITY_CELL_SIZE_XZ,
  DENSITY_CELL_SIZE_Y,
  DENSITY_GRID_SIZE_XZ,
  DENSITY_GRID_SIZE_Y,
  DENSITY_MAIN_XZ_DIVISOR,
  DENSITY_MAIN_Y_DIVISOR,
  DENSITY_SCALE_XZ,
  DEPTH_NOISE_SCALE,
  HEIGHT_VARIANCE_SCALE,
  OCTAVES_DEPTH,
  OCTAVES_HEIGHT_VARIANCE,
  OCTAVES_MAIN,
  OCTAVES_MAX,
  OCTAVES_MIN,
  OCTAVES_SURFACE_DEPTH,
  OCTAVES_SURFACE_SAND,
  SEA_LEVEL,
} from './terrainConstants';
import { CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z } from '../chunkConstants';

/**
 * Raw density-derived block ids: the closed, small vocabulary
 * BetaTerrainGenerator itself ever writes. SurfaceGenerator consumes
 * exactly these three values (never generic BlockRegistry gameplay
 * flags) to decide biome-driven surface replacement.
 */
export const RAW_STONE = BlockIds.Stone;
export const RAW_WATER = BlockIds.Water;
export const RAW_AIR = BlockIds.Air;

/** Per-chunk output: raw block ids (pre-surface-pass) plus the climate used to generate them. */
export interface RawTerrain {
  /** Flattened, matching Chunk's own XZY indexing convention. */
  readonly blocks: Uint8Array;
  /** Per-column climate samples, [x + z*16], reused by SurfaceGenerator so biome selection is consistent. */
  readonly climate: ClimateSample[];
}

/**
 * Faithful port of Beta 1.7.3's ChunkProviderGenerate density generation
 * and density-to-block conversion (Stone / still Water / Air only —
 * bedrock and surface replacement happen in SurfaceGenerator).
 *
 * All per-chunk state is recomputed from (worldSeed, chunkX, chunkZ) with
 * no shared mutable state carried between calls, so generation order
 * never affects the result and negative chunk coordinates work the same
 * as positive ones.
 *
 * Also owns the two surface-pattern noise fields (Beta's `n`/`o`) even
 * though only SurfaceGenerator reads them: Beta constructs all eight
 * octave-noise fields from one shared Random stream in a fixed order, so
 * skipping n/o here would desynchronize every noise field constructed
 * after them (depth, height-variance) from their correct seeded state.
 *
 * Deliberate deviations from Beta, disclosed:
 * - No Ice placement at sea level for cold columns (ice generation is out
 *   of scope for this stage) — cold columns get ordinary still Water.
 * - No MapGenCaves pass (caves are Stage 12B).
 */
export class BetaTerrainGenerator {
  private readonly minNoise: OctaveNoise; // Beta's `k`
  private readonly maxNoise: OctaveNoise; // Beta's `l`
  private readonly mainNoise: OctaveNoise; // Beta's `m`
  public readonly surfaceSandNoise: OctaveNoise; // Beta's `n` (consumed by SurfaceGenerator)
  public readonly surfaceDepthNoise: OctaveNoise; // Beta's `o` (consumed by SurfaceGenerator)
  private readonly depthNoise: OctaveNoise; // Beta's `a`
  private readonly heightVarianceNoise: OctaveNoise; // Beta's `b`
  private readonly climateSampler: ClimateSampler;

  public constructor(worldSeed: bigint) {
    const random = new JavaRandom(worldSeed);

    // Construction order matters: matches Beta's exact sequence
    // (k, l, m, n, o, a, b, c), all drawing from one Random stream.
    this.minNoise = new OctaveNoise(random, OCTAVES_MIN);
    this.maxNoise = new OctaveNoise(random, OCTAVES_MAX);
    this.mainNoise = new OctaveNoise(random, OCTAVES_MAIN);
    this.surfaceSandNoise = new OctaveNoise(random, OCTAVES_SURFACE_SAND);
    this.surfaceDepthNoise = new OctaveNoise(random, OCTAVES_SURFACE_DEPTH);
    this.depthNoise = new OctaveNoise(random, OCTAVES_DEPTH);
    this.heightVarianceNoise = new OctaveNoise(random, OCTAVES_HEIGHT_VARIANCE);
    // Beta's `c` (tree-count noise) is constructed here purely to keep the
    // shared Random stream advancing identically to source; unused because
    // trees are Stage 12C. Not stored as a field since nothing reads it.
    new OctaveNoise(random, 8);

    this.climateSampler = new ClimateSampler(worldSeed);
  }

  /**
   * Generates raw terrain (Stone/Water/Air only) for one chunk, plus the
   * climate samples used to shape it (reused by SurfaceGenerator so both
   * passes agree on biome without resampling noise).
   */
  public generate(chunkX: number, chunkZ: number): RawTerrain {
    const climate = this.climateSampler.sampleRegion(
      chunkX * CHUNK_SIZE_X,
      chunkZ * CHUNK_SIZE_Z,
      CHUNK_SIZE_X,
      CHUNK_SIZE_Z,
    );

    const density = this.buildDensityGrid(chunkX, chunkZ, climate);
    const blocks = this.densityToBlocks(density);

    return { blocks, climate };
  }

  /**
   * Builds the coarse 5x17x5 density control-point grid for one chunk,
   * matching ChunkProviderGenerate's private density-generation method.
   */
  private buildDensityGrid(chunkX: number, chunkZ: number, climate: ClimateSample[]): Float64Array {
    const originX = chunkX * DENSITY_CELL_SIZE_XZ;
    const originZ = chunkZ * DENSITY_CELL_SIZE_XZ;

    // Depth/height-variance noise: matches ChunkProviderGenerate's
    // convenience-overload call `a.a(g, i1, k1, l1, j2, 1.121, 1.121, 0.5)`,
    // which forwards to the 9-arg method as
    // `a(ad, i1, 10D, k1, l1, 1, j2, 1.121, 1.0D, 1.121)` — i.e. origin
    // (originX, 10, originZ), size (5, 1, 5), scale (1.121, 1.0, 1.121).
    // The fixed Y-origin of 10 and Y-size of 1 matter for determinism:
    // dropping them (e.g. using originY=0) samples a different noise
    // plane entirely.
    const depth = this.depthNoise.fillArray(
      originX,
      10,
      originZ,
      DENSITY_GRID_SIZE_XZ,
      1,
      DENSITY_GRID_SIZE_XZ,
      DEPTH_NOISE_SCALE,
      1,
      DEPTH_NOISE_SCALE,
    );
    const heightVariance = this.heightVarianceNoise.fillArray(
      originX,
      10,
      originZ,
      DENSITY_GRID_SIZE_XZ,
      1,
      DENSITY_GRID_SIZE_XZ,
      HEIGHT_VARIANCE_SCALE,
      1,
      HEIGHT_VARIANCE_SCALE,
    );

    const scaleXZ = DENSITY_SCALE_XZ;
    const mainScaleXZ = scaleXZ / DENSITY_MAIN_XZ_DIVISOR;
    const mainScaleY = scaleXZ / DENSITY_MAIN_Y_DIVISOR;

    const main = this.mainNoise.fillArray(
      originX,
      0,
      originZ,
      DENSITY_GRID_SIZE_XZ,
      DENSITY_GRID_SIZE_Y,
      DENSITY_GRID_SIZE_XZ,
      mainScaleXZ,
      mainScaleY,
      mainScaleXZ,
    );
    const minField = this.minNoise.fillArray(
      originX,
      0,
      originZ,
      DENSITY_GRID_SIZE_XZ,
      DENSITY_GRID_SIZE_Y,
      DENSITY_GRID_SIZE_XZ,
      scaleXZ,
      scaleXZ,
      scaleXZ,
    );
    const maxField = this.maxNoise.fillArray(
      originX,
      0,
      originZ,
      DENSITY_GRID_SIZE_XZ,
      DENSITY_GRID_SIZE_Y,
      DENSITY_GRID_SIZE_XZ,
      scaleXZ,
      scaleXZ,
      scaleXZ,
    );

    const density = new Float64Array(
      DENSITY_GRID_SIZE_XZ * DENSITY_GRID_SIZE_Y * DENSITY_GRID_SIZE_XZ,
    );

    let densityIndex = 0;
    let columnIndex = 0;
    // Java uses integer division here (`16 / l1`), which truncates rather
    // than producing 3.2 — reproducing that exactly matters because it
    // changes which climate column each density grid point samples from.
    const columnStep = Math.floor(CHUNK_SIZE_X / DENSITY_GRID_SIZE_XZ);

    for (let gx = 0; gx < DENSITY_GRID_SIZE_XZ; gx++) {
      const climateX = gx * columnStep + Math.floor(columnStep / 2);

      for (let gz = 0; gz < DENSITY_GRID_SIZE_XZ; gz++) {
        const climateZ = gz * columnStep + Math.floor(columnStep / 2);
        const sample = climate[climateX * CHUNK_SIZE_X + climateZ]!;

        const temperature = sample.temperature;
        const humidity = sample.humidity * temperature;
        let humidityFalloff = 1 - humidity;
        humidityFalloff *= humidityFalloff;
        humidityFalloff *= humidityFalloff;
        humidityFalloff = 1 - humidityFalloff;

        let depthValue = (depth[columnIndex]! + 256) / 512;
        depthValue *= humidityFalloff;
        if (depthValue > 1) depthValue = 1;

        let varianceValue = heightVariance[columnIndex]! / 8000;
        if (varianceValue < 0) varianceValue = -varianceValue * 0.3;
        varianceValue = varianceValue * 3 - 2;

        if (varianceValue < 0) {
          varianceValue /= 2;
          if (varianceValue < -1) varianceValue = -1;
          varianceValue /= 1.4;
          varianceValue /= 2;
          depthValue = 0;
        } else {
          if (varianceValue > 1) varianceValue = 1;
          varianceValue /= 8;
        }

        if (depthValue < 0) depthValue = 0;
        depthValue += 0.5;
        varianceValue = (varianceValue * DENSITY_GRID_SIZE_Y) / 16;
        const centerY = DENSITY_GRID_SIZE_Y / 2 + varianceValue * 4;

        columnIndex++;

        for (let gy = 0; gy < DENSITY_GRID_SIZE_Y; gy++) {
          let verticalFalloff = ((gy - centerY) * 12) / depthValue;
          if (verticalFalloff < 0) verticalFalloff *= 4;

          const minValue = minField[densityIndex]! / 512;
          const maxValue = maxField[densityIndex]! / 512;
          const blend = (main[densityIndex]! / 10 + 1) / 2;

          let value: number;
          if (blend < 0) {
            value = minValue;
          } else if (blend > 1) {
            value = maxValue;
          } else {
            value = minValue + (maxValue - minValue) * blend;
          }

          value -= verticalFalloff;

          if (gy > DENSITY_GRID_SIZE_Y - 4) {
            const ceilingBlend = (gy - (DENSITY_GRID_SIZE_Y - 4)) / 3;
            value = value * (1 - ceilingBlend) + -10 * ceilingBlend;
          }

          density[densityIndex] = value;
          densityIndex++;
        }
      }
    }

    return density;
  }

  /**
   * Converts the coarse density grid into full-resolution Stone/Water/Air
   * blocks via trilinear interpolation, matching ChunkProviderGenerate's
   * density-to-block loop exactly (4x8x4 sub-cells per density cell).
   */
  private densityToBlocks(density: Float64Array): Uint8Array {
    const blocks = new Uint8Array(CHUNK_SIZE_X * CHUNK_SIZE_Y * CHUNK_SIZE_Z);
    const cellsXZ = DENSITY_GRID_SIZE_XZ - 1; // 4

    for (let cellX = 0; cellX < cellsXZ; cellX++) {
      for (let cellZ = 0; cellZ < cellsXZ; cellZ++) {
        for (let cellY = 0; cellY < 16; cellY++) {
          const lerpStepY = 0.125;

          let v000 = this.densityAt(density, cellX, cellY, cellZ);
          let v001 = this.densityAt(density, cellX, cellY, cellZ + 1);
          let v100 = this.densityAt(density, cellX + 1, cellY, cellZ);
          let v101 = this.densityAt(density, cellX + 1, cellY, cellZ + 1);

          const d000to010 = (this.densityAt(density, cellX, cellY + 1, cellZ) - v000) * lerpStepY;
          const d001to011 = (this.densityAt(density, cellX, cellY + 1, cellZ + 1) - v001) * lerpStepY;
          const d100to110 = (this.densityAt(density, cellX + 1, cellY + 1, cellZ) - v100) * lerpStepY;
          const d101to111 = (this.densityAt(density, cellX + 1, cellY + 1, cellZ + 1) - v101) * lerpStepY;

          for (let subY = 0; subY < DENSITY_CELL_SIZE_Y; subY++) {
            const lerpStepXAtZ0 = 0.25;
            let vAtZ0 = v000;
            let vAtZ1 = v001;
            const dxAtZ0 = (v100 - v000) * lerpStepXAtZ0;
            const dxAtZ1 = (v101 - v001) * lerpStepXAtZ0;

            for (let subX = 0; subX < DENSITY_CELL_SIZE_XZ; subX++) {
              const worldX = subX + cellX * DENSITY_CELL_SIZE_XZ;
              const lerpStepZ = 0.25;
              let vInterpolated = vAtZ0;
              const dz = (vAtZ1 - vAtZ0) * lerpStepZ;

              for (let subZ = 0; subZ < DENSITY_CELL_SIZE_XZ; subZ++) {
                const worldZ = subZ + cellZ * DENSITY_CELL_SIZE_XZ;
                const worldY = cellY * DENSITY_CELL_SIZE_Y + subY;

                let blockId: number = RAW_AIR;

                if (worldY < SEA_LEVEL) {
                  blockId = RAW_WATER;
                }

                if (vInterpolated > 0) {
                  blockId = RAW_STONE;
                }

                blocks[this.blockIndex(worldX, worldY, worldZ)] = blockId;

                vInterpolated += dz;
              }

              vAtZ0 += dxAtZ0;
              vAtZ1 += dxAtZ1;
            }

            v000 += d000to010;
            v001 += d001to011;
            v100 += d100to110;
            v101 += d101to111;
          }
        }
      }
    }

    return blocks;
  }

  private densityAt(density: Float64Array, gx: number, gy: number, gz: number): number {
    return density[(gx * DENSITY_GRID_SIZE_XZ + gz) * DENSITY_GRID_SIZE_Y + gy]!;
  }

  /** Matches Chunk's own XZY flat-index convention (x fastest, then z, then y). */
  private blockIndex(x: number, y: number, z: number): number {
    return x + z * CHUNK_SIZE_X + y * CHUNK_SIZE_X * CHUNK_SIZE_Z;
  }
}

// Re-exported for CHUNK_SIZE_Y usage clarity in callers/tests without a
// second import path.
export { CHUNK_SIZE_Y };
