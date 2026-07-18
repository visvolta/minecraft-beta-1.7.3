import type { Chunk } from '../Chunk';
import type { WorldGenerator } from '../WorldGenerator';
import { BetaTerrainGenerator } from './BetaTerrainGenerator';
import { SurfaceGenerator } from './SurfaceGenerator';
import { JavaRandom } from './random/JavaRandom';
import { BetaCaveGenerator } from './caves/BetaCaveGenerator';
import { BetaTreeDecorator } from './trees/BetaTreeDecorator';
import { SnowIceGenerator } from './SnowIceGenerator';

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
  /**
   * Whether tree decoration (Stage 12C) runs after cave carving.
   * Defaults to true (matching real Beta 1.7.3, which always decorates
   * trees). Exposed for the same verification/debugging reasons as
   * enableCaves.
   */
  readonly enableTrees?: boolean;
}

/**
 * Orchestrates Beta 1.7.3 terrain generation for one chunk, matching
 * ChunkProviderGenerate's exact pipeline order: raw density terrain
 * (BetaTerrainGenerator) → surface replacement (SurfaceGenerator) →
 * cave carving (BetaCaveGenerator, Stage 12B) → tree decoration
 * (BetaTreeDecorator, Stage 12C) → write into a Chunk. Trees run last,
 * matching the source's own decoration-after-generation-and-caves
 * pipeline order (`ChunkProviderGenerate.b(i,j)` builds terrain+surface+
 * caves; population/decoration, including trees, happens in a separate
 * pass afterward — `ChunkProviderGenerate.a(IChunkProvider,i,j)` — once
 * per chunk, only after the chunk itself is otherwise fully generated).
 *
 * This is the WorldGenerator implementation ChunkStreamer is given;
 * FlatWorldGenerator is fully replaced.
 */
export class BetaWorldGenerator implements WorldGenerator {
  private readonly terrainGenerator: BetaTerrainGenerator;
  private readonly surfaceGenerator: SurfaceGenerator;
  private readonly caveGenerator: BetaCaveGenerator;
  private readonly treeDecorator: BetaTreeDecorator;
  private readonly snowIceGenerator: SnowIceGenerator;
  private readonly enableCaves: boolean;
  private readonly enableTrees: boolean;

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
    this.enableTrees = options.enableTrees ?? true;
    // Passed enableCaves so BetaTreeDecorator's cross-chunk scratch
    // recomputation (see ScratchTreeWorld) matches this generator's own
    // pipeline exactly when it recomputes a neighbouring chunk's terrain
    // read-only for tree space-validation purposes.
    this.treeDecorator = new BetaTreeDecorator(worldSeed, this.terrainGenerator, this.enableCaves);
    this.snowIceGenerator = new SnowIceGenerator();
  }

  public getFirstUncoveredBlock(worldX: number, worldZ: number): { blockId: number; height: number } {
    const chunkX = Math.floor(worldX / 16);
    const chunkZ = Math.floor(worldZ / 16);
    const raw = this.terrainGenerator.generate(chunkX, chunkZ);
    this.surfaceGenerator.apply(chunkX, chunkZ, raw.blocks, raw.climate);

    // Normalize to 0-15. worldX & 15 is slightly incorrect for negative numbers in some languages,
    // but in JS, bitwise ops are 32-bit signed ints, so `worldX & 15` correctly handles negatives mapping to 0-15.
    const localX = worldX & 15;
    const localZ = worldZ & 15;

    let y = 63;
    while (y < 127) {
      const idx = localX + localZ * 16 + (y + 1) * 256;
      if (raw.blocks[idx] === 0) {
        break;
      }
      y++;
    }

    const blockIdx = localX + localZ * 16 + y * 256;
    return { blockId: raw.blocks[blockIdx]!, height: y };
  }

  public populate(chunk: Chunk): void {
    const raw = this.terrainGenerator.generate(chunk.chunkX, chunk.chunkZ);
    this.surfaceGenerator.apply(chunk.chunkX, chunk.chunkZ, raw.blocks, raw.climate);

    if (this.enableCaves) {
      this.caveGenerator.carve(chunk.chunkX, chunk.chunkZ, raw.blocks);
    }

    if (this.enableTrees) {
      this.treeDecorator.decorate(chunk.chunkX, chunk.chunkZ, raw.blocks);
    }

    // Snow/ice finalization for cold biomes (Beta ChunkProviderGenerate population phase).
    // Runs after trees so snow doesn't appear under tree canopies.
    this.snowIceGenerator.apply(chunk.chunkX, chunk.chunkZ, raw.blocks, raw.climate);

    if (!chunk.isTerrainPopulated()) {
      chunk.loadGeneratedBlocks(raw.blocks);
      chunk.setTerrainPopulated(true);
    }
  }
}
