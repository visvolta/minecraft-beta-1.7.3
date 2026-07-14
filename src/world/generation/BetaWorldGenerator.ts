import type { Chunk } from '../Chunk';
import type { WorldGenerator } from '../WorldGenerator';
import { BetaTerrainGenerator } from './BetaTerrainGenerator';
import { SurfaceGenerator } from './SurfaceGenerator';
import { JavaRandom } from './random/JavaRandom';
import { BetaCaveGenerator } from './caves/BetaCaveGenerator';

/** Optional configuration for BetaWorldGenerator. */
export interface BetaWorldGeneratorOptions {
  /**
   * Whether cave carving (Stage 12B) runs after surface replacement.
   * Defaults to true (matching real Beta 1.7.3, which always carves
   * caves). Exposed so caves can be disabled for verification/debugging
   * (e.g. confirming cave-free terrain is unaffected) without needing a
   * second generator implementation.
   */
  readonly enableCaves?: boolean;
}

/**
 * Orchestrates Beta 1.7.3 terrain generation for one chunk, matching
 * ChunkProviderGenerate.b(i,j)'s exact call order: raw density terrain
 * (BetaTerrainGenerator) → surface replacement (SurfaceGenerator) →
 * cave carving (BetaCaveGenerator, Stage 12B) → write into a Chunk.
 * Caves run last, exactly as in the source (`u.a(this, world, i, j,
 * abyte0)` is the final step of chunk generation before the chunk is
 * marked populated).
 *
 * This is the WorldGenerator implementation ChunkStreamer is given;
 * FlatWorldGenerator is fully replaced.
 */
export class BetaWorldGenerator implements WorldGenerator {
  private readonly terrainGenerator: BetaTerrainGenerator;
  private readonly surfaceGenerator: SurfaceGenerator;
  private readonly caveGenerator: BetaCaveGenerator;
  private readonly enableCaves: boolean;

  public constructor(worldSeed: bigint, options: BetaWorldGeneratorOptions = {}) {
    this.terrainGenerator = new BetaTerrainGenerator(worldSeed);
    // Surface generation's per-chunk Random is reseeded on every apply()
    // call (matching Beta's own per-chunk reseed), so its initial seed
    // here is irrelevant.
    this.surfaceGenerator = new SurfaceGenerator(
      new JavaRandom(0),
      this.terrainGenerator.surfaceSandNoise,
      this.terrainGenerator.surfaceDepthNoise,
    );
    this.caveGenerator = new BetaCaveGenerator(worldSeed);
    this.enableCaves = options.enableCaves ?? true;
  }

  public populate(chunk: Chunk): void {
    const raw = this.terrainGenerator.generate(chunk.chunkX, chunk.chunkZ);
    this.surfaceGenerator.apply(chunk.chunkX, chunk.chunkZ, raw.blocks, raw.climate);

    if (this.enableCaves) {
      this.caveGenerator.carve(chunk.chunkX, chunk.chunkZ, raw.blocks);
    }

    chunk.loadGeneratedBlocks(raw.blocks);
  }
}
