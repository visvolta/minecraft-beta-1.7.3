import { BlockIds } from '../../../blocks/BlockId';
import { AIR_BLOCK_ID, CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z } from '../../chunkConstants';
import type { Chunk } from '../../Chunk';
import type { WorldGenerator } from '../../WorldGenerator';
import { JavaRandom } from '../random/JavaRandom';
import { NetherTerrainGenerator } from './NetherTerrainGenerator';

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
  }

  /** Beta `WorldGenHellLava`: a lava spring embedded in a netherrack ceiling. */
  private generateHellLava(chunk: Chunk, random: JavaRandom, x: number, y: number, z: number): void {
    if (y < 1 || y + 1 >= CHUNK_SIZE_Y) return;
    if (chunk.getBlock(x, y + 1, z) !== BlockIds.Netherrack) return;
    const here = chunk.getBlock(x, y, z);
    if (here !== AIR_BLOCK_ID && here !== BlockIds.Netherrack) return;

    // Beta counts solid netherrack neighbours and open air neighbours, and
    // only places when the pocket is mostly enclosed.
    let netherrackNeighbours = 0;
    let airNeighbours = 0;
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nx >= CHUNK_SIZE_X || nz < 0 || nz >= CHUNK_SIZE_Z) continue;
      const neighbour = chunk.getBlock(nx, y, nz);
      if (neighbour === BlockIds.Netherrack) netherrackNeighbours += 1;
      if (neighbour === AIR_BLOCK_ID) airNeighbours += 1;
    }
    if (chunk.getBlock(x, y - 1, z) === BlockIds.Netherrack) netherrackNeighbours += 1;
    if (chunk.getBlock(x, y - 1, z) === AIR_BLOCK_ID) airNeighbours += 1;

    if (netherrackNeighbours === 4 && airNeighbours === 1) {
      chunk.setBlock(x, y, z, BlockIds.LavaStill);
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
