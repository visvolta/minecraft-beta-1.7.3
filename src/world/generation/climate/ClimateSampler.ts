import { JavaRandom } from '../random/JavaRandom';
import { OctaveSimplexNoise2D } from '../noise/OctaveSimplexNoise2D';

/** Per-column temperature and humidity, both reshaped and clamped to [0, 1]. */
export interface ClimateSample {
  readonly temperature: number;
  readonly humidity: number;
}

/**
 * Faithful port of Beta 1.7.3's WorldChunkManager: produces the raw
 * temperature/humidity/variance noise fields and reshapes them into the
 * [0, 1] climate values biome selection depends on.
 *
 * Each field is an independently seeded octave noise (seed = worldSeed *
 * a fixed per-field multiplier), matching the source exactly so a given
 * world seed always reproduces the same climate map.
 *
 * Verified against real JVM output (see world/generation tests).
 */
export class ClimateSampler {
  private readonly temperatureNoise: OctaveSimplexNoise2D;
  private readonly humidityNoise: OctaveSimplexNoise2D;
  private readonly varianceNoise: OctaveSimplexNoise2D;

  public constructor(worldSeed: bigint) {
    this.temperatureNoise = new OctaveSimplexNoise2D(
      new JavaRandom(worldSeed * 9871n),
      4,
    );
    this.humidityNoise = new OctaveSimplexNoise2D(
      new JavaRandom(worldSeed * 39811n),
      4,
    );
    this.varianceNoise = new OctaveSimplexNoise2D(
      new JavaRandom(worldSeed * 0x84a59n),
      2,
    );
  }

  /**
   * Samples a sizeX * sizeZ grid of climate values starting at world
   * block coordinates (originX, originZ). Matches
   * WorldChunkManager.a(MobSpawnerBase[], int, int, int, int)'s
   * temperature/humidity reshaping exactly.
   */
  public sampleRegion(
    originX: number,
    originZ: number,
    sizeX: number,
    sizeZ: number,
  ): ClimateSample[] {
    const rawTemperature = this.temperatureNoise.fillArray(
      originX,
      originZ,
      sizeX,
      sizeZ,
      0.025,
      0.025,
      0.25,
    );
    const rawHumidity = this.humidityNoise.fillArray(
      originX,
      originZ,
      sizeX,
      sizeZ,
      0.05,
      0.05,
      1 / 3,
    );
    const rawVariance = this.varianceNoise.fillArray(
      originX,
      originZ,
      sizeX,
      sizeZ,
      0.25,
      0.25,
      10 / 17,
    );

    const samples: ClimateSample[] = new Array(sizeX * sizeZ);

    for (let i = 0; i < sizeX * sizeZ; i++) {
      const varianceBlend = rawVariance[i]! * 1.1 + 0.5;

      const temperatureWeight = 0.01;
      let temperature =
        (rawTemperature[i]! * 0.15 + 0.7) * (1 - temperatureWeight) +
        varianceBlend * temperatureWeight;
      // Easing curve from source: 1 - (1-t)^2.
      temperature = 1 - (1 - temperature) * (1 - temperature);

      const humidityWeight = 0.002;
      let humidity =
        (rawHumidity[i]! * 0.15 + 0.5) * (1 - humidityWeight) +
        varianceBlend * humidityWeight;

      temperature = clamp01(temperature);
      humidity = clamp01(humidity);

      samples[i] = { temperature, humidity };
    }

    return samples;
  }
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
