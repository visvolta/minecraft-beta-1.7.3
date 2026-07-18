import { WorldSaveCoordinator, createDefaultMetadata } from './coordinator/WorldSaveCoordinator';
import { IndexedDbWorldStorage } from './storage/IndexedDbWorldStorage';
import type { WorldStorage } from './storage/WorldStorage';
import { BetaWorldGenerator } from '../world/generation/BetaWorldGenerator';
import { JavaRandom } from '../world/generation/random/JavaRandom';

function findBetaSpawn(generator: BetaWorldGenerator, seed: bigint): { x: number, y: number, z: number } {
  const rand = new JavaRandom(seed);
  let spawnX = 0;
  let spawnZ = 0;
  let retries = 0;

  // Phase 1: getInitialSpawnLocation
  while (retries < 10000) {
    const { blockId } = generator.getFirstUncoveredBlock(spawnX, spawnZ);
    if (blockId === 12) { // Sand
      break;
    }
    spawnX += rand.nextInt(64) - rand.nextInt(64);
    spawnZ += rand.nextInt(64) - rand.nextInt(64);
    retries++;
  }

  // Phase 2: setSpawnLocation
  retries = 0;
  while (retries < 10000) {
    const { blockId } = generator.getFirstUncoveredBlock(spawnX, spawnZ);
    if (blockId !== 0) {
      break;
    }
    spawnX += rand.nextInt(8) - rand.nextInt(8);
    spawnZ += rand.nextInt(8) - rand.nextInt(8);
    retries++;
  }

  generator.getFirstUncoveredBlock(spawnX, spawnZ);
  return { x: spawnX, y: 64, z: spawnZ };
}

function getSafePlayerY(generator: BetaWorldGenerator, x: number, z: number): number {
  const { height } = generator.getFirstUncoveredBlock(x, z);
  return height + 1; // feet exactly on top of the block
}

/** Opens the sole current world before Engine constructs generation-dependent systems. */
export async function openDefaultWorld(): Promise<{ coordinator: WorldSaveCoordinator, storage: WorldStorage }> {
  const storage = await IndexedDbWorldStorage.open();
  const fallback = createDefaultMetadata();
  const coordinator = await WorldSaveCoordinator.open(storage, fallback);

  // If the loaded metadata exactly matches the dummy fallback, it's a new world.
  if (coordinator.getMetadata().timeTicks === 0 && !coordinator.isDirty() && coordinator.getMetadata().spawn.y === 140) {
    const generator = new BetaWorldGenerator(BigInt(fallback.seed));
    const spawn = findBetaSpawn(generator, BigInt(fallback.seed));
    const playerY = getSafePlayerY(generator, spawn.x, spawn.z);

    coordinator.update({
      ...fallback,
      spawn: { x: spawn.x, y: spawn.y, z: spawn.z },
      player: { x: spawn.x + 0.5, y: playerY, z: spawn.z + 0.5, yaw: 0, pitch: 0 }
    });
    await coordinator.save(true);
  } else {
    // Validate loaded player position
    const current = coordinator.getMetadata();
    const p = current.player;
    const isValid = Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z) && p.y > -100 && p.y < 300;

    if (!isValid) {
      console.warn('Invalid player position in metadata. Falling back to world spawn.', p);
      const generator = new BetaWorldGenerator(BigInt(current.seed));
      const fallbackY = getSafePlayerY(generator, current.spawn.x, current.spawn.z);
      coordinator.update({
        ...current,
        player: { x: current.spawn.x + 0.5, y: fallbackY, z: current.spawn.z + 0.5, yaw: 0, pitch: 0 }
      });
      await coordinator.save(true);
    }
  }

  return { coordinator, storage };
}
