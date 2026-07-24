import { BetaWorldGenerator } from './BetaWorldGenerator';
import { JavaRandom } from './random/JavaRandom';

/**
 * Beta-style spawn finding, moved out of the legacy world-persistence module so
 * the new persistence path does not depend on legacy orchestration. Determines a
 * safe world spawn near (0,0) and a safe player Y for a column.
 */

export function findBetaSpawn(generator: BetaWorldGenerator, seed: bigint): { x: number; y: number; z: number } {
  const rand = new JavaRandom(seed);
  let spawnX = 0;
  let spawnZ = 0;
  let retries = 0;
  while (retries < 10000) {
    const { blockId } = generator.getFirstUncoveredBlock(spawnX, spawnZ);
    if (blockId === 12) break;
    spawnX += rand.nextInt(64) - rand.nextInt(64);
    spawnZ += rand.nextInt(64) - rand.nextInt(64);
    retries++;
  }
  retries = 0;
  while (retries < 10000) {
    const { blockId } = generator.getFirstUncoveredBlock(spawnX, spawnZ);
    if (blockId !== 0) break;
    spawnX += rand.nextInt(8) - rand.nextInt(8);
    spawnZ += rand.nextInt(8) - rand.nextInt(8);
    retries++;
  }
  generator.getFirstUncoveredBlock(spawnX, spawnZ);
  return { x: spawnX, y: 64, z: spawnZ };
}

export function getSafePlayerY(generator: BetaWorldGenerator, x: number, z: number): number {
  const { height } = generator.getFirstUncoveredBlock(x, z);
  return height + 1;
}
