import { JavaRandom } from '../random/JavaRandom';
import { SimplexNoise2D } from './SimplexNoise2D';

/**
 * Faithful port of Beta 1.7.3's NoiseGeneratorOctaves2: stacks N independent
 * SimplexNoise2D instances at increasing frequency and decreasing
 * amplitude (persistence), used by WorldChunkManager for temperature,
 * humidity, and climate-variance fields.
 *
 * Verified against real JVM output (see world/generation tests).
 */
export class OctaveSimplexNoise2D {
  private readonly octaves: SimplexNoise2D[];

  public constructor(random: JavaRandom, octaveCount: number) {
    this.octaves = [];
    for (let i = 0; i < octaveCount; i++) {
      this.octaves.push(new SimplexNoise2D(random));
    }
  }

  /**
   * Fills a flattened [sizeX * sizeY] array, matching
   * NoiseGeneratorOctaves2.a(double[], x, y, sizeX, sizeY, scaleX, scaleY,
   * frequencyGrowth, persistence). `persistence` defaults to 0.5, matching
   * the source's 7-argument overload.
   */
  public fillArray(
    originX: number,
    originY: number,
    sizeX: number,
    sizeY: number,
    scaleX: number,
    scaleY: number,
    frequencyGrowth: number,
    persistence = 0.5,
  ): Float64Array {
    const out = new Float64Array(sizeX * sizeY);

    // Source divides the caller-provided scale by 1.5 before use.
    const baseScaleX = scaleX / 1.5;
    const baseScaleY = scaleY / 1.5;

    let amplitude = 1;
    let frequency = 1;

    for (const octave of this.octaves) {
      octave.addArray(
        out,
        originX,
        originY,
        sizeX,
        sizeY,
        baseScaleX * frequency,
        baseScaleY * frequency,
        0.55 / amplitude,
      );
      frequency *= frequencyGrowth;
      amplitude *= persistence;
    }

    return out;
  }
}
