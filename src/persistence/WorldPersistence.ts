import { WorldSaveCoordinator, createDefaultMetadata } from './coordinator/WorldSaveCoordinator';
import { IndexedDbWorldStorage } from './storage/IndexedDbWorldStorage';
import type { WorldStorage } from './storage/WorldStorage';
import { BetaWorldGenerator } from '../world/generation/BetaWorldGenerator';
import { JavaRandom } from '../world/generation/random/JavaRandom';
import { GameMode } from '../player/GameMode';
import { GENERATOR_VERSION, SAVE_VERSION, type WorldMetadata } from './metadata/WorldMetadata';
import { parseWorldSeed } from './world/SeedParser';
import { readWorldIndex, uniqueWorldId, upsertWorldIndexEntry, type WorldIndexEntry } from './world/WorldIndex';

function findBetaSpawn(generator: BetaWorldGenerator, seed: bigint): { x: number, y: number, z: number } {
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

function getSafePlayerY(generator: BetaWorldGenerator, x: number, z: number): number {
  const { height } = generator.getFirstUncoveredBlock(x, z);
  return height + 1;
}

export interface OpenedWorld { readonly coordinator: WorldSaveCoordinator; readonly storage: WorldStorage; }
export interface NewWorldOptions { readonly name: string; readonly seedText: string; readonly gameMode: GameMode; }

export async function openWorld(worldId: string, storage: WorldStorage): Promise<OpenedWorld> {
  const fallback = { ...createDefaultMetadata(), worldId, name: worldId, displayName: worldId };
  const coordinator = await WorldSaveCoordinator.open(storage, fallback);
  const current = coordinator.getMetadata();
  if (current.timeTicks === 0 && current.spawn.y === 140) {
    const generator = new BetaWorldGenerator(BigInt(current.seed));
    const spawn = findBetaSpawn(generator, BigInt(current.seed));
    const playerY = getSafePlayerY(generator, spawn.x, spawn.z);
    coordinator.update({ ...current, spawn, player: { x: spawn.x + 0.5, y: playerY, z: spawn.z + 0.5, yaw: current.player.yaw, pitch: current.player.pitch } });
    await coordinator.save(true);
  }
  await ensureSpawn(coordinator);
  return { coordinator, storage };
}

export async function createWorld(options: NewWorldOptions, storage: WorldStorage): Promise<OpenedWorld> {
  const index = await readWorldIndex(storage);
  const displayName = options.name.trim();
  if (displayName.length === 0) throw new Error('World name cannot be empty.');
  const worldId = uniqueWorldId(displayName, index.worlds.map((world) => world.worldId));
  const parsed = parseWorldSeed(options.seedText);
  const now = Date.now();
  const generator = new BetaWorldGenerator(BigInt(parsed.seed));
  const spawn = findBetaSpawn(generator, BigInt(parsed.seed));
  const playerY = getSafePlayerY(generator, spawn.x, spawn.z);
  const metadata: WorldMetadata = {
    ...createDefaultMetadata(),
    worldId,
    name: displayName,
    displayName,
    seed: parsed.seed,
    seedText: parsed.seedText,
    createdAt: now,
    lastPlayedAt: 0,
    saveVersion: SAVE_VERSION,
    generatorVersion: GENERATOR_VERSION,
    gameMode: options.gameMode,
    spawn,
    player: { x: spawn.x + 0.5, y: playerY, z: spawn.z + 0.5, yaw: 0, pitch: 0 },
  };
  const coordinator = await WorldSaveCoordinator.open(storage, metadata);
  coordinator.update(metadata);
  await coordinator.save(true);
  await upsertWorldIndexEntry(storage, metadataToIndexEntry(metadata));
  return { coordinator, storage };
}



export async function openDefaultWorld(): Promise<OpenedWorld> {
  return openWorld('default', await IndexedDbWorldStorage.open());
}

export function metadataToIndexEntry(metadata: WorldMetadata): WorldIndexEntry {
  return {
    worldId: metadata.worldId,
    displayName: metadata.displayName ?? metadata.name,
    gameMode: metadata.gameMode ?? GameMode.Survival,
    seed: metadata.seed,
    createdAt: metadata.createdAt ?? 0,
    lastPlayedAt: metadata.lastPlayedAt ?? metadata.lastPlayedMs,
    saveVersion: metadata.saveVersion ?? SAVE_VERSION,
    generatorVersion: metadata.generatorVersion ?? GENERATOR_VERSION,
  };
}

async function ensureSpawn(coordinator: WorldSaveCoordinator): Promise<void> {
  const current = coordinator.getMetadata();
  const p = current.player;
  const valid = Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z) && p.y > -100 && p.y < 300;
  if (valid) return;
  const generator = new BetaWorldGenerator(BigInt(current.seed));
  const y = getSafePlayerY(generator, current.spawn.x, current.spawn.z);
  coordinator.update({ ...current, player: { x: current.spawn.x + 0.5, y, z: current.spawn.z + 0.5, yaw: 0, pitch: 0 } });
  await coordinator.save(true);
}
