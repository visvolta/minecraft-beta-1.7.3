import { JavaRandom } from '../../world/generation/random/JavaRandom.ts';

/**
 * Exact port of Beta 1.7.3 `Chunk.getRandomWithSeed(987234911L)` used by
 * `EntitySlime.getCanSpawnHere`. Uses Java's signed 32-bit integer arithmetic
 * via `Math.imul`, then long (64-bit) addition/XOR via BigInt.
 */
export function isSlimeChunk(worldSeed: bigint, chunkX: number, chunkZ: number): boolean {
  // Java: getRandomWithSeed(987234911L) =
  // new Random(worldSeed + (long)(x*x*4987142) + (long)(x*5947611) + (long)(z*z)*4392871L + (long)(z*389711) ^ 987234911L)
  const xx4987142 = BigInt((Math.imul(Math.imul(chunkX | 0, chunkX | 0), 4987142)) | 0);
  const x5947611 = BigInt((Math.imul(chunkX | 0, 5947611)) | 0);
  const zz4392871 = BigInt(Math.imul(chunkZ | 0, chunkZ | 0) | 0) * 4392871n;
  const z389711 = BigInt((Math.imul(chunkZ | 0, 389711)) | 0);
  const sum = BigInt.asUintN(64, worldSeed + xx4987142 + x5947611 + zz4392871 + z389711);
  const seed = sum ^ 987234911n;
  return new JavaRandom(seed).nextInt(10) === 0;
}
