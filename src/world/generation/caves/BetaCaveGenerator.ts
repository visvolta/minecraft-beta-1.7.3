import { JavaRandom } from '../random/JavaRandom';
import { CaveCarver } from './CaveCarver';

/**
 * Faithful port of Beta 1.7.3's MapGenBase.a(IChunkProvider, World, i, j,
 * byte[]) — the entry point that, for one target chunk, scans a radius-8
 * (17x17) square of source chunks around it, deterministically reseeds a
 * shared Random per source chunk, and delegates the actual carving to
 * MapGenCaves (CaveCarver) for each one.
 *
 * This is the sole integration point BetaWorldGenerator calls; it owns
 * no chunk storage, streaming, or surface/terrain logic of its own.
 *
 * Determinism / order-independence: every source chunk's seed is derived
 * purely from (worldSeed, sourceChunkX, sourceChunkZ) — never from the
 * target chunk or from when/in-what-order chunks were generated. Calling
 * this for target chunk A does not read, write, or otherwise depend on
 * whether target chunk B (a neighbour) has been generated yet; it only
 * ever writes into the target chunk's own block array, recomputing
 * whatever nearby source chunks would contribute from scratch every
 * time. This matches real Beta 1.7.3 exactly (it has no cross-chunk
 * cave cache either) and is what the "no generation-order dependency"
 * requirement is verified against.
 */
export class BetaCaveGenerator {
  /** MapGenBase's default radius field (`a = 8`), not overridden by MapGenCaves. */
  private static readonly SOURCE_CHUNK_RADIUS = 8;

  private readonly worldSeed: bigint;
  private readonly random: JavaRandom;
  private readonly caveCarver: CaveCarver;

  public constructor(worldSeed: bigint) {
    this.worldSeed = worldSeed;
    // Source constructs its own `Random b = new Random()` at MapGenBase
    // construction time, immediately overwritten by `setSeed` on every
    // call to the entry point below — so its initial value here is
    // never observed and any seed is fine.
    this.random = new JavaRandom(0);
    this.caveCarver = new CaveCarver();
  }

  /**
   * Carves caves into `blocks` (mutated in place) for the target chunk
   * at (targetChunkX, targetChunkZ), matching MapGenBase.a(...) exactly:
   * reseed once with the world seed to draw two odd multipliers, then
   * for every source chunk in the radius-8 square around the target,
   * reseed again (XOR'd with the world seed) and delegate to CaveCarver.
   */
  public carve(targetChunkX: number, targetChunkZ: number, blocks: Uint8Array): void {
    const radius = BetaCaveGenerator.SOURCE_CHUNK_RADIUS;

    this.random.setSeed(this.worldSeed);
    // Source: `(b.nextLong() / 2L) * 2L + 1L` — Java's `/` on longs
    // truncates toward zero, matching BigInt division in JS.
    const multiplierX = (this.random.nextLong() / 2n) * 2n + 1n;
    const multiplierZ = (this.random.nextLong() / 2n) * 2n + 1n;

    for (let sourceX = targetChunkX - radius; sourceX <= targetChunkX + radius; sourceX++) {
      for (let sourceZ = targetChunkZ - radius; sourceZ <= targetChunkZ + radius; sourceZ++) {
        // Source: `b.setSeed((long) i1 * l + (long) j1 * l1 ^ world.u)`.
        // Java operator precedence: `*` binds tighter than `^`, so this
        // is `(i1*l + j1*l1) ^ worldSeed`, not `i1*l + (j1*l1 ^ worldSeed)`.
        const seed =
          (BigInt(sourceX) * multiplierX + BigInt(sourceZ) * multiplierZ) ^ this.worldSeed;
        this.random.setSeed(seed);

        this.caveCarver.spawnCaveSystemsForSourceChunk(
          this.random,
          sourceX,
          sourceZ,
          targetChunkX,
          targetChunkZ,
          blocks,
        );
      }
    }
  }
}
