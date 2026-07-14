import { JavaRandom } from '../random/JavaRandom';

/** The 12 fixed gradient directions used by Beta's 2D simplex noise (NoiseGenerator2). */
const GRADIENTS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 1, 0],
  [-1, 1, 0],
  [1, -1, 0],
  [-1, -1, 0],
  [1, 0, 1],
  [-1, 0, 1],
  [1, 0, -1],
  [-1, 0, -1],
  [0, 1, 1],
  [0, -1, 1],
  [0, 1, -1],
  [0, -1, -1],
];

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

/**
 * Faithful port of Beta 1.7.3's NoiseGenerator2: 2D simplex-style noise
 * (distinct from the classic Perlin noise in ImprovedNoise). Used by
 * WorldChunkManager for temperature, humidity, and climate-variance
 * fields, not for terrain density.
 *
 * Verified against real JVM output (see world/generation tests).
 */
export class SimplexNoise2D {
  private readonly permutation: Int32Array;
  public readonly offsetX: number;
  public readonly offsetY: number;
  public readonly offsetZ: number;

  public constructor(random: JavaRandom) {
    this.permutation = new Int32Array(512);
    this.offsetX = random.nextDouble() * 256;
    this.offsetY = random.nextDouble() * 256;
    this.offsetZ = random.nextDouble() * 256;

    for (let i = 0; i < 256; i++) {
      this.permutation[i] = i;
    }

    for (let j = 0; j < 256; j++) {
      const k = random.nextInt(256 - j) + j;
      const l = this.permutation[j]!;
      this.permutation[j] = this.permutation[k]!;
      this.permutation[k] = l;
      this.permutation[j + 256] = this.permutation[j]!;
    }
  }

  /**
   * Fills (adding into) `out`, a flattened [sizeX * sizeY] array, matching
   * NoiseGenerator2.a(double[], x, y, sizeX, sizeY, scaleX, scaleY, amplitude).
   */
  public addArray(
    out: Float64Array,
    originX: number,
    originY: number,
    sizeX: number,
    sizeY: number,
    scaleX: number,
    scaleY: number,
    amplitude: number,
  ): void {
    const p = this.permutation;
    let index = 0;

    for (let xi = 0; xi < sizeX; xi++) {
      const nx = (originX + xi) * scaleX + this.offsetX;

      for (let yi = 0; yi < sizeY; yi++) {
        const ny = (originY + yi) * scaleY + this.offsetY;

        const skew = (nx + ny) * F2;
        const cellX = floorToInt(nx + skew);
        const cellY = floorToInt(ny + skew);

        const unskew = (cellX + cellY) * G2;
        const originUnskewedX = cellX - unskew;
        const originUnskewedY = cellY - unskew;
        const d0x = nx - originUnskewedX;
        const d0y = ny - originUnskewedY;

        let i1: number;
        let j1: number;

        if (d0x > d0y) {
          i1 = 1;
          j1 = 0;
        } else {
          i1 = 0;
          j1 = 1;
        }

        const d1x = d0x - i1 + G2;
        const d1y = d0y - j1 + G2;
        const d2x = d0x - 1 + 2 * G2;
        const d2y = d0y - 1 + 2 * G2;

        const maskedX = cellX & 0xff;
        const maskedY = cellY & 0xff;

        const g0 = p[maskedX + p[maskedY]!]! % 12;
        const g1 = p[maskedX + i1 + p[maskedY + j1]!]! % 12;
        const g2 = p[maskedX + 1 + p[maskedY + 1]!]! % 12;

        const n0 = cornerContribution(g0, d0x, d0y);
        const n1 = cornerContribution(g1, d1x, d1y);
        const n2 = cornerContribution(g2, d2x, d2y);

        const value = out[index] ?? 0;
        out[index] = value + 70 * (n0 + n1 + n2) * amplitude;
        index++;
      }
    }
  }
}

/** Java's `a(double)` helper: floor toward negative infinity, as an int. */
function floorToInt(value: number): number {
  return value <= 0 ? Math.trunc(value) - 1 : Math.trunc(value);
}

function dot2(gradientIndex: number, x: number, y: number): number {
  const gradient = GRADIENTS[gradientIndex]!;
  return gradient[0] * x + gradient[1] * y;
}

function cornerContribution(gradientIndex: number, x: number, y: number): number {
  let t = 0.5 - x * x - y * y;

  if (t < 0) {
    return 0;
  }

  t *= t;
  return t * t * dot2(gradientIndex, x, y);
}
