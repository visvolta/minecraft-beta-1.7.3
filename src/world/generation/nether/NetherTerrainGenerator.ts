import { AIR_BLOCK_ID, CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z } from '../../chunkConstants';
import { BlockIds } from '../../../blocks/BlockId';
import type { Chunk } from '../../Chunk';
import { JavaRandom } from '../random/JavaRandom';
import { OctaveNoise } from '../noise/OctaveNoise';

/**
 * Beta 1.7.3 Nether terrain, ported from `ChunkProviderHell`.
 *
 * Structure mirrors the reference exactly:
 *   generateNetherTerrain -> coarse 5x17x5 density grid, trilinearly
 *                            interpolated into netherrack/lava/air
 *   func_4058_b           -> surface pass: bedrock caps, soul sand and
 *                            gravel patches, lava fill below y=64
 *
 * Constant names keep the Beta values rather than being "tidied", because
 * every one of them changes the generated world.
 */

/** Beta's `var5` in generateNetherTerrain: lava fills below this height. */
const LAVA_SEA_LEVEL = 32;

/** Beta's `var4` in func_4058_b: the soul-sand/gravel band centre. */
const SURFACE_BAND_LEVEL = 64;

/** Density grid is 5x17x5 control points over a 4x4 horizontal cell grid. */
const DENSITY_CELLS_XZ = 4;
const DENSITY_GRID_XZ = DENSITY_CELLS_XZ + 1;
const DENSITY_GRID_Y = 17;

/** Beta noise scales: var8 = 684.412, var10 = 2053.236. */
const NOISE_SCALE_XZ = 684.412;
const NOISE_SCALE_Y = 2053.236;

/** Octave counts from the ChunkProviderHell constructor. */
const OCTAVES_MIN = 16;
const OCTAVES_MAX = 16;
const OCTAVES_MAIN = 8;
const OCTAVES_SURFACE = 4;
const OCTAVES_SURFACE_DEPTH = 4;
const OCTAVES_DEPTH = 10;
const OCTAVES_HEIGHT_VARIANCE = 16;

/** Surface noise scale (`var5 = 0.03125D`). */
const SURFACE_NOISE_SCALE = 0.03125;

export class NetherTerrainGenerator {
  private readonly random: JavaRandom;
  private readonly minNoise: OctaveNoise;
  private readonly maxNoise: OctaveNoise;
  private readonly mainNoise: OctaveNoise;
  private readonly surfaceNoise: OctaveNoise;
  private readonly surfaceDepthNoise: OctaveNoise;
  private readonly depthNoise: OctaveNoise;
  private readonly heightVarianceNoise: OctaveNoise;

  public constructor(worldSeed: bigint) {
    // Beta constructs every generator from one Random seeded with the world
    // seed, so construction order determines the noise tables.
    this.random = new JavaRandom(worldSeed);
    this.minNoise = new OctaveNoise(this.random, OCTAVES_MIN);
    this.maxNoise = new OctaveNoise(this.random, OCTAVES_MAX);
    this.mainNoise = new OctaveNoise(this.random, OCTAVES_MAIN);
    this.surfaceNoise = new OctaveNoise(this.random, OCTAVES_SURFACE);
    this.surfaceDepthNoise = new OctaveNoise(this.random, OCTAVES_SURFACE_DEPTH);
    this.depthNoise = new OctaveNoise(this.random, OCTAVES_DEPTH);
    this.heightVarianceNoise = new OctaveNoise(this.random, OCTAVES_HEIGHT_VARIANCE);
  }

  /**
   * Fills a chunk with Nether terrain. `chunkRandom` must already be seeded
   * the Beta way (`x*341873128712 + z*132897987541`) by the caller, because
   * the surface pass consumes it.
   */
  public generate(chunk: Chunk, chunkRandom: JavaRandom): void {
    this.generateNetherTerrain(chunk);
    this.generateSurface(chunk, chunkRandom);
  }

  /** Beta `generateNetherTerrain`: density grid -> netherrack / lava / air. */
  private generateNetherTerrain(chunk: Chunk): void {
    const density = this.buildDensityGrid(chunk.chunkX, chunk.chunkZ);

    for (let cellX = 0; cellX < DENSITY_CELLS_XZ; cellX++) {
      for (let cellZ = 0; cellZ < DENSITY_CELLS_XZ; cellZ++) {
        for (let cellY = 0; cellY < DENSITY_GRID_Y - 1; cellY++) {
          const yStep = 0.125;
          let d000 = density[((cellX + 0) * DENSITY_GRID_XZ + cellZ + 0) * DENSITY_GRID_Y + cellY]!;
          let d001 = density[((cellX + 0) * DENSITY_GRID_XZ + cellZ + 1) * DENSITY_GRID_Y + cellY]!;
          let d100 = density[((cellX + 1) * DENSITY_GRID_XZ + cellZ + 0) * DENSITY_GRID_Y + cellY]!;
          let d101 = density[((cellX + 1) * DENSITY_GRID_XZ + cellZ + 1) * DENSITY_GRID_Y + cellY]!;
          const dy000 = (density[((cellX + 0) * DENSITY_GRID_XZ + cellZ + 0) * DENSITY_GRID_Y + cellY + 1]! - d000) * yStep;
          const dy001 = (density[((cellX + 0) * DENSITY_GRID_XZ + cellZ + 1) * DENSITY_GRID_Y + cellY + 1]! - d001) * yStep;
          const dy100 = (density[((cellX + 1) * DENSITY_GRID_XZ + cellZ + 0) * DENSITY_GRID_Y + cellY + 1]! - d100) * yStep;
          const dy101 = (density[((cellX + 1) * DENSITY_GRID_XZ + cellZ + 1) * DENSITY_GRID_Y + cellY + 1]! - d101) * yStep;

          for (let subY = 0; subY < 8; subY++) {
            const xStep = 0.25;
            let a = d000;
            let b = d001;
            const da = (d100 - d000) * xStep;
            const db = (d101 - d001) * xStep;
            const worldY = cellY * 8 + subY;

            for (let subX = 0; subX < 4; subX++) {
              const zStep = 0.25;
              let value = a;
              const dValue = (b - a) * zStep;
              const localX = subX + cellX * 4;

              for (let subZ = 0; subZ < 4; subZ++) {
                const localZ = subZ + cellZ * 4;
                let blockId: number = AIR_BLOCK_ID;
                if (worldY < LAVA_SEA_LEVEL) blockId = BlockIds.LavaStill;
                if (value > 0) blockId = BlockIds.Netherrack;
                chunk.setBlock(localX, worldY, localZ, blockId);
                value += dValue;
              }

              a += da;
              b += db;
            }

            d000 += dy000;
            d001 += dy001;
            d100 += dy100;
            d101 += dy101;
          }
        }
      }
    }
  }

  /**
   * Beta `func_4058_b`: bedrock caps, soul-sand/gravel surface patches around
   * y=64, and lava fill for exposed cells below the band.
   */
  private generateSurface(chunk: Chunk, chunkRandom: JavaRandom): void {
    const originX = chunk.chunkX * CHUNK_SIZE_X;
    const originZ = chunk.chunkZ * CHUNK_SIZE_Z;
    const scale = SURFACE_NOISE_SCALE;

    // Beta samples three 16x16 fields; note the deliberate axis order and the
    // 109.0134 Y-origin for the gravel field.
    const soilField = this.surfaceNoise.fillArray(originX, originZ, 0, 16, 16, 1, scale, scale, 1);
    const gravelField = this.surfaceNoise.fillArray(originX, 109.0134, originZ, 16, 1, 16, scale, 1, scale);
    const depthField = this.surfaceDepthNoise.fillArray(originX, originZ, 0, 16, 16, 1, scale * 2, scale * 2, scale * 2);

    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        const soulSandHere = soilField[x + z * 16]! + chunkRandom.nextDouble() * 0.2 > 0;
        const gravelHere = gravelField[x + z * 16]! + chunkRandom.nextDouble() * 0.2 > 0;
        const depth = Math.trunc(depthField[x + z * 16]! / 3 + 3 + chunkRandom.nextDouble() * 0.25);
        let remaining = -1;
        let topBlock: number = BlockIds.Netherrack;
        let fillBlock: number = BlockIds.Netherrack;

        for (let y = CHUNK_SIZE_Y - 1; y >= 0; y--) {
          // Bedrock roof and floor, each with a ragged 0..4 block variance.
          if (y >= CHUNK_SIZE_Y - 1 - chunkRandom.nextInt(5)) {
            chunk.setBlock(x, y, z, BlockIds.Bedrock);
            continue;
          }
          if (y <= 0 + chunkRandom.nextInt(5)) {
            chunk.setBlock(x, y, z, BlockIds.Bedrock);
            continue;
          }

          const current = chunk.getBlock(x, y, z);
          if (current === AIR_BLOCK_ID) {
            remaining = -1;
            continue;
          }
          if (current !== BlockIds.Netherrack) continue;

          if (remaining === -1) {
            if (depth <= 0) {
              topBlock = AIR_BLOCK_ID;
              fillBlock = BlockIds.Netherrack;
            } else if (y >= SURFACE_BAND_LEVEL - 4 && y <= SURFACE_BAND_LEVEL + 1) {
              topBlock = BlockIds.Netherrack;
              fillBlock = BlockIds.Netherrack;
              if (gravelHere) topBlock = BlockIds.Gravel;
              if (gravelHere) fillBlock = BlockIds.Netherrack;
              if (soulSandHere) topBlock = BlockIds.SoulSand;
              if (soulSandHere) fillBlock = BlockIds.SoulSand;
            }

            if (y < SURFACE_BAND_LEVEL && topBlock === AIR_BLOCK_ID) {
              topBlock = BlockIds.LavaStill;
            }

            remaining = depth;
            chunk.setBlock(x, y, z, y >= SURFACE_BAND_LEVEL - 1 ? topBlock : fillBlock);
          } else if (remaining > 0) {
            remaining -= 1;
            chunk.setBlock(x, y, z, fillBlock);
          }
        }
      }
    }
  }

  /**
   * Beta `func_4057_a`: the 5x17x5 density control-point grid.
   *
   * The cosine term plus the cubic clamp near both vertical extremes is what
   * produces the Nether's closed bedrock ceiling and floor.
   */
  private buildDensityGrid(chunkX: number, chunkZ: number): Float64Array {
    const originX = chunkX * DENSITY_CELLS_XZ;
    const originZ = chunkZ * DENSITY_CELLS_XZ;
    const sizeXZ = DENSITY_GRID_XZ;
    const sizeY = DENSITY_GRID_Y;

    const depth = this.depthNoise.fillArray(originX, 0, originZ, sizeXZ, 1, sizeXZ, 1, 0, 1);
    const heightVariance = this.heightVarianceNoise.fillArray(originX, 0, originZ, sizeXZ, 1, sizeXZ, 100, 0, 100);
    const main = this.mainNoise.fillArray(
      originX, 0, originZ, sizeXZ, sizeY, sizeXZ,
      NOISE_SCALE_XZ / 80, NOISE_SCALE_Y / 60, NOISE_SCALE_XZ / 80,
    );
    const minLimit = this.minNoise.fillArray(
      originX, 0, originZ, sizeXZ, sizeY, sizeXZ, NOISE_SCALE_XZ, NOISE_SCALE_Y, NOISE_SCALE_XZ,
    );
    const maxLimit = this.maxNoise.fillArray(
      originX, 0, originZ, sizeXZ, sizeY, sizeXZ, NOISE_SCALE_XZ, NOISE_SCALE_Y, NOISE_SCALE_XZ,
    );

    const out = new Float64Array(sizeXZ * sizeY * sizeXZ);

    // Vertical shaping curve, precomputed once per chunk.
    const shape = new Float64Array(sizeY);
    for (let y = 0; y < sizeY; y++) {
      shape[y] = Math.cos((y * Math.PI * 6) / sizeY) * 2;
      let distance = y;
      if (y > sizeY / 2) distance = sizeY - 1 - y;
      if (distance < 4) {
        const d = 4 - distance;
        shape[y] = shape[y]! - d * d * d * 10;
      }
    }

    let index = 0;
    let columnIndex = 0;
    for (let gx = 0; gx < sizeXZ; gx++) {
      for (let gz = 0; gz < sizeXZ; gz++) {
        let depthScale = (depth[columnIndex]! + 256) / 512;
        if (depthScale > 1) depthScale = 1;

        let variance = heightVariance[columnIndex]! / 8000;
        if (variance < 0) variance = -variance;
        variance = variance * 3 - 3;
        if (variance < 0) {
          variance /= 2;
          if (variance < -1) variance = -1;
          variance /= 1.4;
          variance /= 2;
          depthScale = 0;
        } else {
          if (variance > 1) variance = 1;
          variance /= 6;
        }

        depthScale += 0.5;
        variance = (variance * sizeY) / 16;
        columnIndex += 1;

        // Beta computes `var19` (0.0) and never reassigns it; the branch it
        // guards is therefore dead, but the loop below keeps the same shape.
        const lowerBound = 0;

        for (let gy = 0; gy < sizeY; gy++) {
          let value: number;
          const shapeTerm = shape[gy]!;
          const lower = minLimit[index]! / 512;
          const upper = maxLimit[index]! / 512;
          const blend = (main[index]! / 10 + 1) / 2;
          if (blend < 0) value = lower;
          else if (blend > 1) value = upper;
          else value = lower + (upper - lower) * blend;

          value -= shapeTerm;

          if (gy > sizeY - 4) {
            const t = (gy - (sizeY - 4)) / 3;
            value = value * (1 - t) + -10 * t;
          }
          if (gy < lowerBound) {
            let t = (lowerBound - gy) / 4;
            if (t < 0) t = 0;
            if (t > 1) t = 1;
            value = value * (1 - t) + -10 * t;
          }

          out[index] = value;
          index += 1;
        }
      }
    }

    // `variance`/`depthScale` participate in Beta's dead-code paths only.
    void NOISE_SCALE_Y;
    return out;
  }
}
