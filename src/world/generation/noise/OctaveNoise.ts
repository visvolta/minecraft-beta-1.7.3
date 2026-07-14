import { JavaRandom } from '../random/JavaRandom';
import { ImprovedNoise } from './ImprovedNoise';

/**
 * Faithful port of Beta 1.7.3's NoiseGeneratorOctaves: stacks N independent
 * ImprovedNoise instances, each sampled at half the frequency of the
 * previous octave and summed with weight matching the source's exact loop.
 *
 * Verified against real JVM output (see world/generation tests).
 */
export class OctaveNoise {
  private readonly octaves: ImprovedNoise[];

  public constructor(random: JavaRandom, octaveCount: number) {
    this.octaves = [];
    for (let i = 0; i < octaveCount; i++) {
      this.octaves.push(new ImprovedNoise(random));
    }
  }

  /** Point sample at (x, z), matching NoiseGeneratorOctaves.a(double,double). */
  public sample2D(x: number, z: number): number {
    let total = 0;
    let frequency = 1;

    for (const octave of this.octaves) {
      total += octave.sample2D(x * frequency, z * frequency) / frequency;
      frequency /= 2;
    }

    return total;
  }

  /**
   * Fills a flattened [sizeX * sizeY * sizeZ] array, matching
   * NoiseGeneratorOctaves.a(double[], x, y, z, sizeX, sizeY, sizeZ,
   * scaleX, scaleY, scaleZ). Always allocates/clears fresh (the source's
   * "reuse ad if non-null" optimization isn't needed here).
   */
  public fillArray(
    originX: number,
    originY: number,
    originZ: number,
    sizeX: number,
    sizeY: number,
    sizeZ: number,
    scaleX: number,
    scaleY: number,
    scaleZ: number,
  ): Float64Array {
    const out = new Float64Array(sizeX * sizeY * sizeZ);
    let amplitudeDivisor = 1;

    for (const octave of this.octaves) {
      octave.addArray(
        out,
        originX,
        originY,
        originZ,
        sizeX,
        sizeY,
        sizeZ,
        scaleX * amplitudeDivisor,
        scaleY * amplitudeDivisor,
        scaleZ * amplitudeDivisor,
        amplitudeDivisor,
      );
      amplitudeDivisor /= 2;
    }

    return out;
  }
}
