import { BlockIds } from '../../../blocks/BlockId';
import { AIR_BLOCK_ID, CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z } from '../../chunkConstants';
import type { Chunk } from '../../Chunk';
import type { WorldGenerator } from '../../WorldGenerator';
import type { TreeWorldAccessor } from '../trees/TreeWorldAccessor';
import { JavaRandom } from '../random/JavaRandom';
import { NetherTerrainGenerator } from './NetherTerrainGenerator';
import { WorldGenMinable } from '../decoration/WorldGenMinable';

/**
 * Beta 1.7.3 Nether world generator (`ChunkProviderHell`).
 *
 * Implements the same `WorldGenerator` interface as the Overworld generator,
 * so the chunk streamer and generation queue stay dimension-agnostic — there
 * is no `if (dimension === -1)` anywhere in streaming code. The dimension
 * definition decides which generator to build.
 *
 * Population (`ChunkProviderHell.populate`) runs against the chunk being
 * generated. Beta populates using neighbour-aware world writes with an offset
 * of +8; here features are clamped to the owning chunk so generation stays
 * order-independent and deterministic, which this project requires and Beta's
 * own populate step does not guarantee.
 */
export class NetherWorldGenerator implements WorldGenerator {
  private readonly terrain: NetherTerrainGenerator;
  private readonly worldSeed: bigint;
  /** Monotonic tiebreaker for scheduled lava-spring ticks within a chunk. */
  private nextTickSequence = 0;
  /** Non-Beta extension: quartz ore vein generator (replaces Netherrack). */
  private readonly quartzGen = new WorldGenMinable(BlockIds.NetherQuartzOre, 14, BlockIds.Netherrack);

  public constructor(worldSeed: bigint) {
    this.worldSeed = worldSeed;
    this.terrain = new NetherTerrainGenerator(worldSeed);
  }

  public populate(chunk: Chunk): void {
    // Beta: hellRNG.setSeed(x * 341873128712L + z * 132897987541L)
    const chunkRandom = new JavaRandom(
      BigInt(chunk.chunkX) * 341873128712n + BigInt(chunk.chunkZ) * 132897987541n,
    );

    this.terrain.generate(chunk, chunkRandom);
    this.decorate(chunk, chunkRandom);
    chunk.setTerrainPopulated(true);
  }

  /** Beta `ChunkProviderHell.populate` feature set. */
  private decorate(chunk: Chunk, random: JavaRandom): void {
    // 8 lava springs, y in [4, 124).
    for (let i = 0; i < 8; i++) {
      this.generateHellLava(chunk, random, random.nextInt(16), random.nextInt(120) + 4, random.nextInt(16));
    }

    // rand(rand(10)+1)+1 fire clusters.
    const fireCount = random.nextInt(random.nextInt(10) + 1) + 1;
    for (let i = 0; i < fireCount; i++) {
      this.generateFire(chunk, random, random.nextInt(16), random.nextInt(120) + 4, random.nextInt(16));
    }

    // rand(rand(10)+1) hanging glowstone clusters.
    const glowstoneCount = random.nextInt(random.nextInt(10) + 1);
    for (let i = 0; i < glowstoneCount; i++) {
      this.generateGlowstone(chunk, random, random.nextInt(16), random.nextInt(120) + 4, random.nextInt(16));
    }

    // 10 scattered glowstone clusters anywhere in the column.
    for (let i = 0; i < 10; i++) {
      this.generateGlowstone(chunk, random, random.nextInt(16), random.nextInt(CHUNK_SIZE_Y), random.nextInt(16));
    }

    // Brown and red mushrooms (Beta guards both with `nextInt(1) == 0`, i.e. always).
    this.generateMushroom(chunk, random, BlockIds.BrownMushroom);
    this.generateMushroom(chunk, random, BlockIds.RedMushroom);

    // ---- Non-Beta extension: Nether Quartz Ore generation (1.5-era) ----
    // Uses a SEPARATE RNG stream so the authentic Beta Nether RNG is untouched.
    this.generateQuartz(chunk);
  }

  /**
   * Non-Beta extension: Nether Quartz Ore generation.
   *
   * Historical params (1.5): ~70 attempts/chunk, vein size 14, Y 10–117,
   * replaces Netherrack only. Runs on a dedicated RNG seeded from worldSeed
   * XOR a constant + the chunk coordinate hash — completely independent of the
   * Beta `chunkRandom` stream so Nether determinism is preserved.
   */
  private generateQuartz(chunk: Chunk): void {
    const quartzSeed = this.worldSeed ^ 0x517A5274n; // 'QzRz'
    const quartzRng = new JavaRandom(
      quartzSeed + BigInt(chunk.chunkX) * 341873128712n + BigInt(chunk.chunkZ) * 132897987541n,
    );
    const accessor: TreeWorldAccessor = {
      getBlock: (wx, wy, wz) => chunk.getBlock(wx, wy, wz),
      setBlock: (wx, wy, wz, id) => { chunk.setBlock(wx, wy, wz, id); },
      getHeight: () => CHUNK_SIZE_Y,
    };
    for (let i = 0; i < 70; i++) {
      const qx = quartzRng.nextInt(16);
      const qy = quartzRng.nextInt(108) + 10; // Y 10–117
      const qz = quartzRng.nextInt(16);
      this.quartzGen.generate(accessor, quartzRng, qx - 8, qy, qz - 8);
    }
  }

  /**
   * Beta `WorldGenHellLava`: a lava spring embedded in a netherrack wall or
   * ceiling, which then flows out to form a lavafall.
   *
   * Beta's exact predicate:
   *   - the block ABOVE must be netherrack;
   *   - the block itself must be air or netherrack;
   *   - of the five neighbours (4 horizontal + below) EXACTLY FOUR are
   *     netherrack and EXACTLY ONE is air.
   *
   * That single air neighbour is the mouth the lava pours out of, which is
   * precisely what makes these lavafalls rather than sealed pockets. Beta then
   * places `lavaMoving` (id 10) and runs one immediate update tick so the
   * spring starts flowing during generation.
   *
   * Placing a STILL source here instead was wrong twice over: still lava never
   * spreads, so no lavafall ever formed, and the block id did not match the
   * reference. The block is placed as flowing and marked for a fluid update so
   * the runtime fluid simulation takes it from there.
   *
   * Out-of-chunk neighbours are treated as netherrack rather than skipped:
   * the Nether is solid netherrack by default, so this keeps the enclosure
   * count meaningful at chunk borders instead of silently failing the `== 4`
   * test for every edge column.
   */
  private generateHellLava(chunk: Chunk, random: JavaRandom, x: number, y: number, z: number): void {
    if (y < 1 || y + 1 >= CHUNK_SIZE_Y) return;
    if (chunk.getBlock(x, y + 1, z) !== BlockIds.Netherrack) return;
    const here = chunk.getBlock(x, y, z);
    if (here !== AIR_BLOCK_ID && here !== BlockIds.Netherrack) return;

    let netherrackNeighbours = 0;
    let airNeighbours = 0;
    const tally = (nx: number, ny: number, nz: number): void => {
      if (nx < 0 || nx >= CHUNK_SIZE_X || nz < 0 || nz >= CHUNK_SIZE_Z) {
        // Outside this chunk: default Nether fill is netherrack.
        netherrackNeighbours += 1;
        return;
      }
      const neighbour = chunk.getBlock(nx, ny, nz);
      if (neighbour === BlockIds.Netherrack) netherrackNeighbours += 1;
      else if (neighbour === AIR_BLOCK_ID) airNeighbours += 1;
    };

    tally(x - 1, y, z);
    tally(x + 1, y, z);
    tally(x, y, z - 1);
    tally(x, y, z + 1);
    tally(x, y - 1, z);

    if (netherrackNeighbours === 4 && airNeighbours === 1) {
      // Beta: Block.lavaMoving + an immediate updateTick so it starts flowing.
      chunk.setBlock(x, y, z, BlockIds.LavaFlowing);
      // Beta runs the update tick immediately during generation. Here the
      // spring is queued on the chunk's own scheduled-tick queue instead: it
      // survives save/load, it is indexed when the chunk is adopted, and it
      // keeps generation free of world/runtime dependencies. The fluid
      // simulation then spreads it into a lavafall on the first tick.
      chunk.getScheduledTicks().schedule(x, y, z, BlockIds.LavaFlowing, 0, this.nextTickSequence++);
    }

    void random;
  }

  /** Beta `WorldGenFire`: 64 attempts to place fire on netherrack. */
  private generateFire(chunk: Chunk, random: JavaRandom, x: number, y: number, z: number): void {
    for (let i = 0; i < 64; i++) {
      const fx = x + random.nextInt(8) - random.nextInt(8);
      const fy = y + random.nextInt(4) - random.nextInt(4);
      const fz = z + random.nextInt(8) - random.nextInt(8);
      if (fx < 0 || fx >= CHUNK_SIZE_X || fz < 0 || fz >= CHUNK_SIZE_Z) continue;
      if (fy < 1 || fy >= CHUNK_SIZE_Y) continue;
      if (chunk.getBlock(fx, fy, fz) === AIR_BLOCK_ID && chunk.getBlock(fx, fy - 1, fz) === BlockIds.Netherrack) {
        chunk.setBlock(fx, fy, fz, BlockIds.Fire);
      }
    }
  }

  /**
   * Beta `WorldGenGlowStone1`/`2`: seed a glowstone block under a netherrack
   * ceiling, then grow a hanging cluster below it.
   *
   * Beta runs 1500 placement attempts per cluster; that is retained because
   * the attempt count and RNG draws shape the resulting cluster.
   */
  private generateGlowstone(chunk: Chunk, random: JavaRandom, x: number, y: number, z: number): void {
    if (y < 1 || y + 1 >= CHUNK_SIZE_Y) return;
    if (chunk.getBlock(x, y, z) !== AIR_BLOCK_ID) return;
    if (chunk.getBlock(x, y + 1, z) !== BlockIds.Netherrack) return;

    chunk.setBlock(x, y, z, BlockIds.Glowstone);

    for (let i = 0; i < 1500; i++) {
      const gx = x + random.nextInt(8) - random.nextInt(8);
      const gy = y - random.nextInt(12);
      const gz = z + random.nextInt(8) - random.nextInt(8);
      if (gx < 0 || gx >= CHUNK_SIZE_X || gz < 0 || gz >= CHUNK_SIZE_Z) continue;
      if (gy < 0 || gy >= CHUNK_SIZE_Y) continue;
      if (chunk.getBlock(gx, gy, gz) !== AIR_BLOCK_ID) continue;

      // Count adjacent glowstone; Beta requires exactly one neighbour so the
      // cluster grows as a hanging stalactite rather than a solid blob.
      let neighbours = 0;
      if (gx > 0 && chunk.getBlock(gx - 1, gy, gz) === BlockIds.Glowstone) neighbours += 1;
      if (gx + 1 < CHUNK_SIZE_X && chunk.getBlock(gx + 1, gy, gz) === BlockIds.Glowstone) neighbours += 1;
      if (gz > 0 && chunk.getBlock(gx, gy, gz - 1) === BlockIds.Glowstone) neighbours += 1;
      if (gz + 1 < CHUNK_SIZE_Z && chunk.getBlock(gx, gy, gz + 1) === BlockIds.Glowstone) neighbours += 1;
      if (gy > 0 && chunk.getBlock(gx, gy - 1, gz) === BlockIds.Glowstone) neighbours += 1;
      if (gy + 1 < CHUNK_SIZE_Y && chunk.getBlock(gx, gy + 1, gz) === BlockIds.Glowstone) neighbours += 1;

      if (neighbours === 1) chunk.setBlock(gx, gy, gz, BlockIds.Glowstone);
    }
  }

  /** Beta uses `WorldGenFlowers` with the mushroom block ids. */
  private generateMushroom(chunk: Chunk, random: JavaRandom, blockId: number): void {
    const x = random.nextInt(16);
    const y = random.nextInt(CHUNK_SIZE_Y);
    const z = random.nextInt(16);

    for (let i = 0; i < 64; i++) {
      const mx = x + random.nextInt(8) - random.nextInt(8);
      const my = y + random.nextInt(4) - random.nextInt(4);
      const mz = z + random.nextInt(8) - random.nextInt(8);
      if (mx < 0 || mx >= CHUNK_SIZE_X || mz < 0 || mz >= CHUNK_SIZE_Z) continue;
      if (my < 1 || my >= CHUNK_SIZE_Y) continue;
      if (chunk.getBlock(mx, my, mz) === AIR_BLOCK_ID && chunk.getBlock(mx, my - 1, mz) === BlockIds.Netherrack) {
        chunk.setBlock(mx, my, mz, blockId);
      }
    }
  }

  /** Exposed for parity checks; the Nether has no meaningful surface height. */
  public getSeed(): bigint {
    return this.worldSeed;
  }
}
