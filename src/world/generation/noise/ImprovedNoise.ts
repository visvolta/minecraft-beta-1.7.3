import { JavaRandom } from '../random/JavaRandom';

/**
 * Faithful port of Beta 1.7.3's NoiseGeneratorPerlin: classic "improved"
 * 3D Perlin noise (Ken Perlin's 2002 gradient/fade scheme), single octave.
 *
 * The permutation table is built from a JavaRandom-driven Fisher-Yates
 * shuffle, exactly matching the constructor in the decompiled source, so
 * a given seed produces the same gradient field as Beta.
 *
 * Verified against real JVM output (see world/generation tests).
 */
export class ImprovedNoise {
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

  /** Point sample at (x, y, z). */
  public sample3D(x: number, y: number, z: number): number {
    let dx = x + this.offsetX;
    let dy = y + this.offsetY;
    let dz = z + this.offsetZ;

    let ix = Math.floor(dx);
    let iy = Math.floor(dy);
    let iz = Math.floor(dz);

    const maskedX = ix & 0xff;
    const maskedY = iy & 0xff;
    const maskedZ = iz & 0xff;

    dx -= ix;
    dy -= iy;
    dz -= iz;

    const fadeX = fade(dx);
    const fadeY = fade(dy);
    const fadeZ = fade(dz);

    const p = this.permutation;
    const a1 = p[maskedX]! + maskedY;
    const a2 = p[a1]! + maskedZ;
    const a3 = p[a1 + 1]! + maskedZ;
    const b1 = p[maskedX + 1]! + maskedY;
    const b2 = p[b1]! + maskedZ;
    const b3 = p[b1 + 1]! + maskedZ;

    return lerp(
      fadeZ,
      lerp(
        fadeY,
        lerp(fadeX, grad3(p[a2]!, dx, dy, dz), grad3(p[b2]!, dx - 1, dy, dz)),
        lerp(fadeX, grad3(p[a3]!, dx, dy - 1, dz), grad3(p[b3]!, dx - 1, dy - 1, dz)),
      ),
      lerp(
        fadeY,
        lerp(fadeX, grad3(p[a2 + 1]!, dx, dy, dz - 1), grad3(p[b2 + 1]!, dx - 1, dy, dz - 1)),
        lerp(fadeX, grad3(p[a3 + 1]!, dx, dy - 1, dz - 1), grad3(p[b3 + 1]!, dx - 1, dy - 1, dz - 1)),
      ),
    );
  }

  /** Point sample at (x, z), z-plane fixed at 0 (matches the 2D overload). */
  public sample2D(x: number, z: number): number {
    return this.sample3D(x, z, 0);
  }

  /**
   * Fills (adding into) `out`, a flattened [sizeX * sizeY * sizeZ] array,
   * with noise sampled on a grid starting at (originX, originY, originZ)
   * with per-axis frequency (scaleX, scaleY, scaleZ) and amplitude
   * `1 / amplitudeDivisor`. Faithful port of NoiseGeneratorPerlin.a(...),
   * including its special-cased sizeY === 1 fast path (used for 2D-style
   * fills flattened into a 3D call signature).
   */
  public addArray(
    out: Float64Array,
    originX: number,
    originY: number,
    originZ: number,
    sizeX: number,
    sizeY: number,
    sizeZ: number,
    scaleX: number,
    scaleY: number,
    scaleZ: number,
    amplitudeDivisor: number,
  ): void {
    const p = this.permutation;
    const invAmplitude = 1 / amplitudeDivisor;

    if (sizeY === 1) {
      let index = 0;

      for (let xi = 0; xi < sizeX; xi++) {
        let nx = (originX + xi) * scaleX + this.offsetX;
        let ix = Math.floor(nx);
        const maskedX = ix & 0xff;
        nx -= ix;
        const fadeX = fade(nx);

        for (let zi = 0; zi < sizeZ; zi++) {
          let nz = (originZ + zi) * scaleZ + this.offsetZ;
          let iz = Math.floor(nz);
          const maskedZ = iz & 0xff;
          nz -= iz;
          const fadeZ = fade(nz);

          const a1 = p[maskedX]! + 0;
          const a2 = p[a1]! + maskedZ;
          const b1 = p[maskedX + 1]! + 0;
          const b2 = p[b1]! + maskedZ;

          const n1 = lerp(fadeX, grad3(p[a2]!, nx, 0, nz), grad3(p[b2]!, nx - 1, 0, nz));
          const n2 = lerp(
            fadeX,
            grad3(p[a2 + 1]!, nx, 0, nz - 1),
            grad3(p[b2 + 1]!, nx - 1, 0, nz - 1),
          );
          const value = lerp(fadeZ, n1, n2);

          out[index] = (out[index] ?? 0) + value * invAmplitude;
          index++;
        }
      }

      return;
    }

    let index = 0;
    let lastMaskedY = -1;
    let c1 = 0;
    let c2 = 0;
    let c3 = 0;
    let c4 = 0;

    for (let xi = 0; xi < sizeX; xi++) {
      let nx = (originX + xi) * scaleX + this.offsetX;
      let ix = Math.floor(nx);
      const maskedX = ix & 0xff;
      nx -= ix;
      const fadeX = fade(nx);

      for (let zi = 0; zi < sizeZ; zi++) {
        let nz = (originZ + zi) * scaleZ + this.offsetZ;
        let iz = Math.floor(nz);
        const maskedZ = iz & 0xff;
        nz -= iz;
        const fadeZ = fade(nz);

        for (let yi = 0; yi < sizeY; yi++) {
          let ny = (originY + yi) * scaleY + this.offsetY;
          let iy = Math.floor(ny);
          const maskedY = iy & 0xff;
          ny -= iy;
          const fadeY = fade(ny);

          if (yi === 0 || maskedY !== lastMaskedY) {
            lastMaskedY = maskedY;

            const a1 = p[maskedX]! + maskedY;
            const a2 = p[a1]! + maskedZ;
            const a3 = p[a1 + 1]! + maskedZ;
            const b1 = p[maskedX + 1]! + maskedY;
            const b2 = p[b1]! + maskedZ;
            const b3 = p[b1 + 1]! + maskedZ;

            c1 = lerp(fadeX, grad3(p[a2]!, nx, ny, nz), grad3(p[b2]!, nx - 1, ny, nz));
            c2 = lerp(fadeX, grad3(p[a3]!, nx, ny - 1, nz), grad3(p[b3]!, nx - 1, ny - 1, nz));
            c3 = lerp(fadeX, grad3(p[a2 + 1]!, nx, ny, nz - 1), grad3(p[b2 + 1]!, nx - 1, ny, nz - 1));
            c4 = lerp(
              fadeX,
              grad3(p[a3 + 1]!, nx, ny - 1, nz - 1),
              grad3(p[b3 + 1]!, nx - 1, ny - 1, nz - 1),
            );
          }

          const n1 = lerp(fadeY, c1, c2);
          const n2 = lerp(fadeY, c3, c4);
          const value = lerp(fadeZ, n1, n2);

          out[index] = (out[index] ?? 0) + value * invAmplitude;
          index++;
        }
      }
    }
  }
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(t: number, a: number, b: number): number {
  return a + t * (b - a);
}

/** 3D gradient function (16-direction variant), matching NoiseGeneratorPerlin.a(int,double,double,double). */
function grad3(hash: number, x: number, y: number, z: number): number {
  const h = hash & 0xf;
  const u = h >= 8 ? y : x;
  const v = h >= 4 ? (h !== 12 && h !== 14 ? z : x) : y;
  return ((h & 1) !== 0 ? -u : u) + ((h & 2) !== 0 ? -v : v);
}
