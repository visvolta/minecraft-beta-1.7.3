import { MemoryWorldStorage } from '../src/persistence/storage/WorldStorage.ts';
import { parseWorldSeed } from '../src/persistence/world/SeedParser.ts';
import { readWorldIndex, removeWorldIndexEntry, sanitizeWorldId, uniqueWorldId, upsertWorldIndexEntry } from '../src/persistence/world/WorldIndex.ts';
import { GameMode } from '../src/player/GameMode.ts';
import { createWorld, metadataToIndexEntry, openWorld } from '../src/persistence/WorldPersistence.ts';
import { readFileSync } from 'node:fs';

function assert(value: boolean, message: string): void { if (!value) throw new Error(message); }
function pngSize(path: string): readonly [number, number] { const b=readFileSync(path); return [b.readUInt32BE(16), b.readUInt32BE(20)]; }

async function main(): Promise<void> {
  assert(pngSize('public/textures/gui/menu_BG.png')[0] === 16, 'menu_BG supplied asset is present');
  assert(pngSize('public/textures/gui/minecraft_title_logo.png')[0] === 1024, 'title logo supplied asset is present');
  assert(pngSize('public/textures/gui/button_normal.png')[0] === 200, 'button_normal asset is present');
  assert(pngSize('public/textures/gui/loadingbar_fill.png')[0] > 0 && pngSize('public/textures/gui/empty_loadingbar.png')[0] > 0, 'loading bar assets are present');

  assert(parseWorldSeed('123').seed === '123', 'numeric seed parses directly');
  assert(parseWorldSeed('-99').seed === '-99', 'negative seed parses directly');
  assert(parseWorldSeed('hello').seed === parseWorldSeed('hello').seed, 'text seed is deterministic');
  assert(parseWorldSeed('999999999999999999999999').seed !== '999999999999999999999999', 'large numeric seed is reduced consistently');
  assert(parseWorldSeed('   ', () => 5n).seed === '5', 'empty seed uses supplied random source');

  assert(sanitizeWorldId('New World!') === 'new-world', 'world id is sanitized from display name');
  assert(uniqueWorldId('New World', ['new-world']) === 'new-world-1', 'duplicate display names get unique stable ids');

  const storage = new MemoryWorldStorage();
  let index = await readWorldIndex(storage);
  assert(index.worlds.length === 0, 'empty world index starts empty');
  const created = await createWorld({ name: 'Unicode 世界 '.trim(), seedText: 'abc', gameMode: GameMode.Creative }, storage);
  const meta = created.coordinator.getMetadata();
  assert(meta.displayName === 'Unicode 世界' && meta.seedText === 'abc' && meta.gameMode === GameMode.Creative, 'created world stores display name, seed text and game mode');
  await upsertWorldIndexEntry(storage, metadataToIndexEntry(meta));
  index = await readWorldIndex(storage);
  assert(index.worlds.length === 1 && index.worlds[0]!.worldId === meta.worldId, 'world index contains only summary pointer to world');
  const loaded = await openWorld(meta.worldId, storage);
  assert(loaded.coordinator.getMetadata().seed === meta.seed, 'existing world seed restores from metadata');
  const renamed = { ...loaded.coordinator.getMetadata(), name: 'Renamed', displayName: 'Renamed' };
  loaded.coordinator.update(renamed); await loaded.coordinator.save(true); await upsertWorldIndexEntry(storage, metadataToIndexEntry(loaded.coordinator.getMetadata()));
  index = await readWorldIndex(storage);
  assert(index.worlds[0]!.worldId === meta.worldId && index.worlds[0]!.displayName === 'Renamed', 'rename changes display name only and keeps world id stable');
  await storage.deleteWorld?.(meta.worldId); await removeWorldIndexEntry(storage, meta.worldId);
  assert((await readWorldIndex(storage)).worlds.length === 0, 'delete removes world index entry by stable id');

  const appSource = readFileSync('src/app/ApplicationController.ts','utf8');
  assert(appSource.includes("'main_menu'") && appSource.includes("'world_loading'") && appSource.includes('new Engine'), 'ApplicationController coordinates typed app states and Engine creation');
  assert(appSource.indexOf('prepareSpawn') < appSource.indexOf('new Engine'), 'Engine is created after spawn preparation in load flow');
  console.log('Stage 13 menu/world validation passed.');
}
void main();
