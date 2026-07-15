import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../../chunkConstants';
import { JavaRandom } from '../random/JavaRandom';
import { BetaTerrainGenerator } from '../BetaTerrainGenerator';
import { ClimateSampler } from '../climate/ClimateSampler';
import { selectBiome } from '../climate/BiomeSelector';
import type { BiomeId } from '../climate/biomes';
import { TreeGenerator } from './TreeGenerator';
import { BigTreeGenerator } from './BigTreeGenerator';
import { TaigaTree1Generator } from './TaigaTree1Generator';
import { TaigaTree2Generator } from './TaigaTree2Generator';
import { ScratchTreeWorld } from './TreeWorldAccessor';

/**
 * Faithful port of the tree-placement slice of Beta 1.7.3's
 * ChunkProviderGenerate.a(IChunkProvider, i, j) — the per-chunk
 * decoration/population method. Only the tree-related portion is
 * ported (lakes, dungeons, clay, and ore veins are explicitly out of
 * scope for this stage and are NOT replicated, including their RNG
 * consumption — see the "Temporary independent RNG stream" note below).
 *
 * ============================================================
 * TEMPORARY DEVIATION (explicitly approved, to be revisited):
 * ============================================================
 * Real Beta draws tree placement from the SAME shared per-chunk Random
 * stream that lakes/dungeons/clay/ore-vein decoration consume
 * immediately before it, in a fixed order. Since none of those other
 * decorators are implemented yet, this class seeds its OWN independent
 * Random stream (a fixed per-chunk reseed, still fully deterministic
 * and seed-derived) rather than replicating their exact RNG-consumption
 * sequence just to keep the shared stream synchronized. This means tree
 * positions in this project do NOT currently match real Beta's actual
 * per-seed layout end-to-end (they would, if lakes/dungeons/etc. were
 * also implemented and consumed the stream first) — but the tree
 * PLACEMENT ALGORITHM itself (density formula, per-biome bonuses, type
 * selection, and every individual tree shape) is verified bit-for-bit
 * correct in isolation against compiled mc-dev/Poseidon Java, by feeding
 * the same starting Random state directly into the corresponding
 * generator.
 *
 * When a future stage adds lakes/dungeons/clay/ores, this class's
 * reseed should be replaced with the literal continuation of that
 * shared stream (see BetaCaveGenerator/SurfaceGenerator for the
 * existing precedent of this exact reseed pattern), and tree placement
 * will automatically become end-to-end bit-compatible with real Beta
 * without touching any tree generator's own algorithm.
 *
 * Cross-chunk trees: a tree's origin (chunkX*16+nextInt(16)+8,
 * chunkZ*16+nextInt(16)+8) always lands within 8 blocks of the chunk's
 * own bounds, but its canopy/branches can legitimately extend into a
 * neighbouring chunk. Matching BetaCaveGenerator's proven approach:
 * decorating target chunk T replays tree placement for T AND every
 * neighbour chunk whose trees could plausibly reach into T (radius 1 is
 * sufficient — Beta's own tree generators never reach farther than a
 * few blocks past their origin chunk's own bounds), using a
 * ScratchTreeWorld to read/write world-space positions across that
 * whole neighbourhood without ever touching a real, already-loaded
 * neighbour Chunk object. Only whatever lands inside T's own array is
 * copied back — writes to any other chunk in the scratch neighbourhood
 * are discarded. This guarantees: (a) no duplicated trees (a tree
 * originating in chunk A is replayed identically whether decorating A
 * or a neighbour of A, so the SAME tree's canopy always resolves to the
 * same blocks regardless of which target chunk asked), (b) no cut-off
 * trees (a canopy reaching into a neighbour is fully computed, just
 * only the portion inside the current target is kept — the neighbour's
 * own decoration pass independently keeps its own portion the same
 * way), and (c) zero generation-order dependency (every chunk's
 * contribution is a pure function of (worldSeed, chunkX, chunkZ), never
 * of another chunk's actual generation state).
 */

/** Matches Beta's `IChunkProvider.a`'s neighbour-reach radius assumption for tree canopies. */
const NEIGHBOUR_RADIUS = 1;

/** Per-chunk seed scramble constants, matching ChunkProviderGenerate.b(i,j) / SurfaceGenerator's own copy of the same constants. */
const CHUNK_SEED_MULTIPLIER_X = 0x4f9939f508n;
const CHUNK_SEED_MULTIPLIER_Z = 0x1ef1565bd5n;

export class BetaTreeDecorator {
  private readonly worldSeed: bigint;
  private readonly terrainGenerator: BetaTerrainGenerator;
  private readonly climateSampler: ClimateSampler;
  private readonly enableCaves: boolean;
  private readonly random = new JavaRandom(0);

  public constructor(worldSeed: bigint, terrainGenerator: BetaTerrainGenerator, enableCaves: boolean) {
    this.worldSeed = worldSeed;
    this.terrainGenerator = terrainGenerator;
    this.climateSampler = new ClimateSampler(worldSeed);
    this.enableCaves = enableCaves;
  }

  /**
   * Decorates `targetBlocks` (the target chunk's own already-generated,
   * already-cave-carved block array — mutated in place) with trees,
   * replaying tree placement from the target chunk and its immediate
   * neighbours per this class's doc comment.
   */
  public decorate(targetChunkX: number, targetChunkZ: number, targetBlocks: Uint8Array): void {
    const scratch = new ScratchTreeWorld(this.worldSeed, this.terrainGenerator, this.enableCaves);
    scratch.seedTargetChunk(targetChunkX, targetChunkZ, targetBlocks);

    for (let sourceX = targetChunkX - NEIGHBOUR_RADIUS; sourceX <= targetChunkX + NEIGHBOUR_RADIUS; sourceX++) {
      for (let sourceZ = targetChunkZ - NEIGHBOUR_RADIUS; sourceZ <= targetChunkZ + NEIGHBOUR_RADIUS; sourceZ++) {
        this.decorateSourceChunk(sourceX, sourceZ, scratch);
      }
    }

    // Copy back only the target chunk's own cells (writes to any other
    // scratch chunk are discarded — each of those neighbours will
    // independently recompute and keep its own portion when IT is the
    // target of a future decorate() call).
    const finalTargetBlocks = scratch.getScratchBlocks(targetChunkX, targetChunkZ)!;
    targetBlocks.set(finalTargetBlocks);
  }

  /**
   * Replays the tree-placement portion of one source chunk's decoration
   * pass (matching ChunkProviderGenerate's tree-count formula, type
   * selection, and per-tree placement loop exactly), writing into
   * `scratch` (which may reach into neighbouring chunks).
   */
  private decorateSourceChunk(chunkX: number, chunkZ: number, scratch: ScratchTreeWorld): void {
    const originX = chunkX * CHUNK_SIZE_X;
    const originZ = chunkZ * CHUNK_SIZE_Z;

    // TEMPORARY: independent per-chunk reseed (see class doc comment) —
    // not a continuation of any shared lakes/dungeons/ore-vein stream.
    const chunkSeed =
      BigInt(chunkX) * CHUNK_SEED_MULTIPLIER_X + BigInt(chunkZ) * CHUNK_SEED_MULTIPLIER_Z;
    this.random.setSeed(chunkSeed ^ this.worldSeed);

    const biomeId = this.sampleChunkBiome(chunkX, chunkZ);

    // Source: `int j5 = (int)((c.a(k1*0.5, l1*0.5) / 8D + nextDouble()*4D + 4D) / 3D)`.
    const treeNoiseSample = this.terrainGenerator.treeCountNoise.sample2D(
      originX * 0.5,
      originZ * 0.5,
    );
    const baseTreeFactor = Math.trunc(
      (treeNoiseSample / 8 + this.random.nextDouble() * 4 + 4) / 3,
    );

    let treeCount = 0;
    if (this.random.nextInt(10) === 0) {
      treeCount++;
    }
    treeCount += this.biomeTreeCountBonus(biomeId, baseTreeFactor);

    if (treeCount <= 0) {
      return;
    }

    const { generator, isTaiga } = this.selectTreeType(biomeId);

    // A fresh BigTreeGenerator instance per SOURCE CHUNK decoration
    // pass, matching real Beta exactly: `Object obj = new WorldGenTrees();
    // if (...) obj = new WorldGenBigTree();` constructs one instance
    // that is then reused for every tree placed by THIS chunk's
    // decoration loop only (see BigTreeGenerator's own doc comment for
    // why that reuse — specifically its persisted trunk-height field —
    // is a genuine, verified Beta behaviour, not a bug). A new instance
    // is always created per call to decorateSourceChunk (i.e. per
    // source chunk, never shared across chunks or cached on this
    // decorator instance).
    const bigTreeGenerator = new BigTreeGenerator();
    bigTreeGenerator.configure(1.0, 1.0, 1.0);

    for (let i = 0; i < treeCount; i++) {
      const x = originX + this.random.nextInt(CHUNK_SIZE_X) + 8;
      const z = originZ + this.random.nextInt(CHUNK_SIZE_Z) + 8;
      const y = scratch.getHeight(x, z);

      if (isTaiga) {
        // Per-tree Taiga1/Taiga2 reselection (Poseidon's own per-call
        // `BiomeTaiga.a(Random)` behaviour) — see class doc comment on
        // why Taiga uses per-tree reselection while Oak/BigOak use
        // mc-dev's literal once-per-chunk selection.
        const taigaGenerator = this.random.nextInt(3) === 0 ? this.taigaTree1 : this.taigaTree2;
        taigaGenerator.generate(scratch, this.random, x, y, z);
        continue;
      }

      if (generator === 'big') {
        bigTreeGenerator.generate(scratch, this.random, x, y, z);
      } else {
        this.treeGenerator.generate(scratch, this.random, x, y, z);
      }
    }
  }

  /** Matches WorldChunkManager.a(k1+16, l1+16): one biome sample at the chunk's far corner, used for the whole chunk's decoration. */
  private sampleChunkBiome(chunkX: number, chunkZ: number): BiomeId {
    const sampleX = chunkX * CHUNK_SIZE_X + 16;
    const sampleZ = chunkZ * CHUNK_SIZE_Z + 16;
    const [climate] = this.climateSampler.sampleRegion(sampleX, sampleZ, 1, 1);
    return selectBiome(climate!).id;
  }

  /**
   * Matches ChunkProviderGenerate's per-biome tree-count adjustment
   * chain exactly (Forest/Rainforest/Taiga: +baseFactor+5; Seasonal
   * Forest: +baseFactor+2; Desert/Tundra/Plains: -20 — the loop bound
   * check above means these never actually produce trees, matching the
   * source's own effective behaviour since treeCount can't go negative
   * in a for-loop bound). Swampland/Shrubland/Savanna get no bonus
   * (0), matching the source (no `if` branch touches them at all).
   */
  private biomeTreeCountBonus(biomeId: BiomeId, baseFactor: number): number {
    switch (biomeId) {
      case 'forest':
        return baseFactor + 5;
      case 'rainforest':
        return baseFactor + 5;
      case 'seasonalForest':
        return baseFactor + 2;
      case 'taiga':
        return baseFactor + 5;
      case 'desert':
      case 'tundra':
      case 'plains':
        return -20;
      default:
        return 0;
    }
  }

  /**
   * Matches ChunkProviderGenerate's tree-type selection: default Oak;
   * 1-in-10 chance of Big Oak regardless of biome; Rainforest gets an
   * ADDITIONAL 1-in-3 chance to override to Big Oak. Taiga is handled
   * separately (see decorateSourceChunk) since real Beta (via
   * Project-Poseidon's biome-driven refactor, the only source with
   * Taiga trees at all) reselects Taiga1 vs Taiga2 per tree rather than
   * once per chunk.
   */
  private selectTreeType(biomeId: BiomeId): { generator: 'oak' | 'big'; isTaiga: boolean } {
    if (biomeId === 'taiga') {
      return { generator: 'oak', isTaiga: true };
    }

    let generator: 'oak' | 'big' = 'oak';

    if (this.random.nextInt(10) === 0) {
      generator = 'big';
    }

    if (biomeId === 'rainforest' && this.random.nextInt(3) === 0) {
      generator = 'big';
    }

    return { generator, isTaiga: false };
  }

  private readonly treeGenerator = new TreeGenerator();
  private readonly taigaTree1 = new TaigaTree1Generator();
  private readonly taigaTree2 = new TaigaTree2Generator();
}
