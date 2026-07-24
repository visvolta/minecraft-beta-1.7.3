/**
 * Stage 1+2 service + backend-contract validation, run against BOTH backends:
 *   - Backend contract parity: MemoryStorageBackend and IdbStorageBackend (the
 *     latter via fake-indexeddb) implement the same observable contract
 *     (chunk/record/world-index read-write-delete, flush, close-after-settle).
 *   - Memory-specific: injected failures and artificial delays (test support).
 *   - WorldPersistenceService: full-chunk save -> barrier -> load round-trip;
 *     deterministic revision clean-marking (re-dirty stays dirty); missing chunk
 *     -> undefined; corrupt record fails loud (with the failing validation
 *     stage) and is preserved; metadata load/save; bounded autosave
 *     (saveSomeDirty); unload as a one-shot state transition + cancelUnload;
 *     forced-save barrier covering earlier background writes; closing rejects
 *     new background writes and new reads; close settles work but NEVER closes
 *     the shared backend (another world can open afterwards — amendment 3);
 *     savedAt comes from the injected clock (diagnostic only).
 */
import 'fake-indexeddb/auto';
import { Chunk } from '../src/world/Chunk.ts';
import { MemoryStorageBackend } from '../src/persistence2/backend/MemoryStorageBackend.ts';
import { IdbStorageBackend } from '../src/persistence2/backend/IdbStorageBackend.ts';
import type { StorageBackend, WorldSummary } from '../src/persistence2/backend/StorageBackend.ts';
import {
  WorldPersistenceService,
  WRITE_PRIORITY_BACKGROUND,
  WRITE_PRIORITY_FORCED,
  type WorldPersistenceServiceOptions,
} from '../src/persistence2/WorldPersistenceService.ts';
import { decodeChunkRecord, CHUNK_RECORD_HEADER_SIZE } from '../src/persistence2/codec/ChunkRecord.ts';
import { RecordCorruptionError } from '../src/persistence2/codec/PersistenceError.ts';
import { type WorldMetadata } from '../src/persistence/metadata/WorldMetadata.ts';
import { assert, assertEqual, runSuite, withTimeout, type TestCase } from './persistence2Harness.ts';

let idbCounter = 0;
const memoryFactory = (): StorageBackend => new MemoryStorageBackend();
const idbFactory = (): StorageBackend => new IdbStorageBackend({ dbName: `p2-test-${idbCounter++}` });

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
  return true;
}

function makeDirtyChunk(x: number, z: number): Chunk {
  const chunk = new Chunk(x, z);
  chunk.setBlock(5, 64, 7, 42);
  chunk.setBlock(0, 0, 0, 1);
  chunk.setTerrainPopulated(true);
  assert(chunk.isPersistenceDirty(), `chunk (${x},${z}) starts dirty`);
  return chunk;
}

function makeSummary(overrides: Partial<WorldSummary> = {}): WorldSummary {
  return {
    worldId: 'w1',
    name: 'World One',
    displayName: 'World One',
    formatVersion: 1,
    gameMode: 'survival',
    seed: '-47',
    generatorVersion: 'beta-browser-1',
    saveVersion: 1,
    createdAtMs: 100,
    lastPlayedMs: 200,
    ...overrides,
  };
}

function makeMetadata(worldId = 'w'): WorldMetadata {
  return {
    formatVersion: 1,
    worldId,
    name: 'Test World',
    seed: '-47',
    spawn: { x: 8, y: 64, z: 8 },
    player: { x: 8.5, y: 65, z: 8.5, yaw: 0, pitch: 0 },
    timeTicks: 0,
    difficulty: 2,
    weather: { raining: false, thundering: false, rainTime: 0, thunderTime: 0 },
    autosave: { enabled: true, intervalSeconds: 30 },
    lastPlayedMs: 0,
  };
}

async function makeOpenService(makeBackend: () => StorageBackend, options?: { clock?: () => number }): Promise<{ backend: StorageBackend; service: WorldPersistenceService }> {
  const backend = makeBackend();
  const serviceOptions: WorldPersistenceServiceOptions = { backend };
  if (options?.clock !== undefined) serviceOptions.clock = options.clock;
  const service = new WorldPersistenceService(serviceOptions);
  await service.open('w');
  return { backend, service };
}

function backendContractCases(makeBackend: () => StorageBackend, label: string): TestCase[] {
  return [
    {
      name: `${label}: chunk write/read/delete`,
      run: async () => {
        const backend = makeBackend();
        await backend.open();
        assert((await backend.readChunk('w', 0, 0)) === undefined, 'absent chunk -> undefined');
        const data = new Uint8Array([1, 2, 3, 4, 5]);
        await backend.writeChunk('w', 0, 0, data);
        const read = await backend.readChunk('w', 0, 0);
        assert(read !== undefined && bytesEqual(read, data), 'chunk round-trips');
        await backend.deleteChunk('w', 0, 0);
        assert((await backend.readChunk('w', 0, 0)) === undefined, 'deleted chunk -> undefined');
        await backend.close();
      },
    },
    {
      name: `${label}: world-record write/read/delete`,
      run: async () => {
        const backend = makeBackend();
        await backend.open();
        const value = new Uint8Array([9, 8, 7]);
        await backend.writeRecord('w', 'metadata', value);
        const read = await backend.readRecord('w', 'metadata');
        assert(read !== undefined && bytesEqual(read, value), 'record round-trips');
        await backend.deleteRecord('w', 'metadata');
        assert((await backend.readRecord('w', 'metadata')) === undefined, 'deleted record -> undefined');
        await backend.close();
      },
    },
    {
      name: `${label}: world index upsert/list/delete (extended summary)`,
      run: async () => {
        const backend = makeBackend();
        await backend.open();
        assertEqual((await backend.listWorlds()).length, 0, 'no worlds initially');
        await backend.upsertWorld(makeSummary());
        let worlds = await backend.listWorlds();
        assertEqual(worlds.length, 1, 'one world listed');
        assertEqual(worlds[0]!.worldId, 'w1', 'world id');
        assertEqual(worlds[0]!.displayName, 'World One', 'world displayName');
        assertEqual(worlds[0]!.gameMode, 'survival', 'world gameMode');
        assertEqual(worlds[0]!.seed, '-47', 'world seed');
        await backend.upsertWorld(makeSummary({ displayName: 'Renamed', gameMode: 'creative' }));
        worlds = await backend.listWorlds();
        assertEqual(worlds.length, 1, 'upsert does not duplicate');
        assertEqual(worlds[0]!.displayName, 'Renamed', 'world renamed');
        assertEqual(worlds[0]!.gameMode, 'creative', 'world gameMode updated');
        await backend.deleteWorld('w1');
        assertEqual((await backend.listWorlds()).length, 0, 'world deleted');
        await backend.close();
      },
    },
    {
      name: `${label}: flush resolves and close rejects subsequent ops`,
      run: async () => {
        const backend = makeBackend();
        await backend.open();
        await backend.writeChunk('w', 1, 1, new Uint8Array([1]));
        await backend.flush();
        await backend.close();
        let rejected = false;
        await backend.readChunk('w', 1, 1).catch(() => { rejected = true; });
        assert(rejected, 'read after backend close rejects');
      },
    },
    {
      name: `${label}: deleteWorld removes the world's chunks and records`,
      run: async () => {
        const backend = makeBackend();
        await backend.open();
        await backend.upsertWorld(makeSummary({ worldId: 'w' }));
        await backend.writeChunk('w', 0, 0, new Uint8Array([1]));
        await backend.writeRecord('w', 'metadata', new Uint8Array([2]));
        await backend.deleteWorld('w');
        assert((await backend.readChunk('w', 0, 0)) === undefined, 'chunk removed with world');
        assert((await backend.readRecord('w', 'metadata')) === undefined, 'record removed with world');
        assertEqual((await backend.listWorlds()).length, 0, 'world index entry removed');
        await backend.close();
      },
    },
  ];
}

function memorySpecificCases(): TestCase[] {
  return [
    {
      name: 'memory backend injects failures with the same completion/failure semantics',
      run: async () => {
        const backend = new MemoryStorageBackend();
        await backend.open();
        backend.setFailureInjector((op, key) => (op === 'writeChunk' && key.includes('5,5') ? new Error('injected write failure') : undefined));
        let rejected = false;
        await backend.writeChunk('w', 5, 5, new Uint8Array([1])).catch((error) => {
          rejected = true;
          assert(error instanceof Error && error.message.includes('injected'), 'injected error surfaces');
        });
        assert(rejected, 'injected failure rejects the operation');
        await backend.writeChunk('w', 6, 6, new Uint8Array([2]));
        assert((await backend.readChunk('w', 6, 6)) !== undefined, 'unaffected write succeeds');
        backend.setFailureInjector(null);
        await backend.writeChunk('w', 5, 5, new Uint8Array([3]));
        assert((await backend.readChunk('w', 5, 5)) !== undefined, 'after clearing the injector, the write succeeds');
        await backend.close();
      },
    },
    {
      name: 'memory backend applies artificial delays (delayed-operation support)',
      run: async () => {
        const backend = new MemoryStorageBackend();
        await backend.open();
        backend.setDelay(30);
        const start = Date.now();
        await backend.writeChunk('w', 0, 0, new Uint8Array([1]));
        const elapsed = Date.now() - start;
        assert(elapsed >= 25, `delay applied (elapsed ${elapsed}ms)`);
        await backend.close();
      },
    },
  ];
}

function serviceCases(makeBackend: () => StorageBackend, label: string): TestCase[] {
  return [
    {
      name: `${label}: save -> barrier -> load round-trips a full-size chunk`,
      run: async () => {
        const { service, backend } = await makeOpenService(makeBackend);
        const chunk = makeDirtyChunk(3, -2);
        await withTimeout(service.saveChunk(chunk), 8000, 'saveChunk');
        assert(!chunk.isPersistenceDirty(), 'chunk clean after save (saved revision matched)');
        await service.flushBarrier();
        const loaded = await withTimeout(service.loadChunk(3, -2), 8000, 'loadChunk');
        assert(loaded instanceof Chunk, 'loaded a Chunk (not undefined/corrupt)');
        assertEqual(loaded!.getBlock(5, 64, 7), 42, 'block restores intact');
        assertEqual(loaded!.getBlock(0, 0, 0), 1, 'second block restores intact');
        assert(loaded!.isTerrainPopulated(), 'populated flag restores intact');
        assert(!loaded!.isPersistenceDirty(), 'loaded chunk starts clean');
        await service.close();
        await backend.close();
      },
    },
    {
      name: `${label}: a chunk re-dirtied during save stays dirty; a later save cleans it`,
      run: async () => {
        const { service, backend } = await makeOpenService(makeBackend);
        const chunk = makeDirtyChunk(0, 0);
        const savePromise = service.saveChunk(chunk); // snapshot taken synchronously here
        chunk.setBlock(1, 1, 1, 7); // bumps persistenceRevision after the snapshot
        await savePromise;
        assert(chunk.isPersistenceDirty(), 'chunk modified during the save remains dirty');
        await service.saveChunk(chunk);
        assert(!chunk.isPersistenceDirty(), 'subsequent save cleans the re-dirtied chunk');
        await service.close();
        await backend.close();
      },
    },
    {
      name: `${label}: loading an absent chunk returns undefined (generate terrain)`,
      run: async () => {
        const { service, backend } = await makeOpenService(makeBackend);
        const loaded = await service.loadChunk(123, 456);
        assert(loaded === undefined, 'absent chunk -> undefined');
        await service.close();
        await backend.close();
      },
    },
    {
      name: `${label}: a corrupt chunk record fails loud, carries its stage, and is preserved`,
      run: async () => {
        const { backend, service } = await makeOpenService(makeBackend);
        const chunk = makeDirtyChunk(1, 1);
        await service.saveChunk(chunk);
        const stored = await backend.readChunk('w', 1, 1);
        assert(stored !== undefined, 'record stored');
        const tampered = stored!.slice();
        tampered[CHUNK_RECORD_HEADER_SIZE + 3] = (tampered[CHUNK_RECORD_HEADER_SIZE + 3]! ^ 0xff) & 0xff;
        await backend.writeChunk('w', 1, 1, tampered);
        let thrown: RecordCorruptionError | undefined;
        try {
          await service.loadChunk(1, 1);
        } catch (error) {
          assert(error instanceof RecordCorruptionError, 'load throws RecordCorruptionError');
          thrown = error;
        }
        assert(thrown !== undefined, 'loading a corrupt record throws (fail loud)');
        assertEqual(thrown!.stage, 'checksum', 'corruption stage is checksum');
        assertEqual(thrown!.kind, 'chunk', 'corruption kind is chunk');
        const after = await backend.readChunk('w', 1, 1);
        assert(after !== undefined && bytesEqual(after, tampered), 'corrupt record preserved unchanged');
        await service.close();
        await backend.close();
      },
    },
    {
      name: `${label}: metadata load/save round-trips (creation then reload)`,
      run: async () => {
        const backend = makeBackend();
        const service = new WorldPersistenceService({ backend });
        await service.open('w');
        assert((await service.loadMetadata()) === undefined, 'no metadata before creation');
        await service.saveMetadata(makeMetadata('w'), WRITE_PRIORITY_FORCED);
        assertEqual(service.getMetadata()?.name, 'Test World', 'metadata cached after save');
        await service.close();
        const reopened = new WorldPersistenceService({ backend });
        await reopened.open('w');
        const loaded = await reopened.loadMetadata();
        assert(loaded !== undefined, 'metadata loads after reopen');
        assertEqual(loaded!.name, 'Test World', 'metadata name persists');
        assertEqual(loaded!.seed, '-47', 'metadata seed persists');
        await reopened.close();
        await backend.close();
      },
    },
    {
      name: `${label}: corrupt metadata fails loud with a schema/version stage`,
      run: async () => {
        const backend = makeBackend();
        const service = new WorldPersistenceService({ backend });
        await service.open('w');
        await backend.writeRecord('w', 'metadata', new TextEncoder().encode('{"formatVersion":999}'));
        let thrown: RecordCorruptionError | undefined;
        try {
          await service.loadMetadata();
        } catch (error) {
          assert(error instanceof RecordCorruptionError, 'metadata corruption throws RecordCorruptionError');
          thrown = error;
        }
        assert(thrown !== undefined, 'corrupt metadata throws');
        assertEqual(thrown!.kind, 'metadata', 'corruption kind is metadata');
        assertEqual(thrown!.stage, 'version', 'unsupported metadata version -> stage version');
        await service.close();
        await backend.close();
      },
    },
    {
      name: `${label}: bounded autosave (saveSomeDirty) saves up to max dirty chunks`,
      run: async () => {
        const backend = makeBackend();
        const service = new WorldPersistenceService({ backend });
        await service.open('w');
        const chunks = [makeDirtyChunk(0, 0), makeDirtyChunk(1, 0), makeDirtyChunk(2, 0), makeDirtyChunk(3, 0)];
        const enqueued = await service.saveSomeDirty(chunks, 2);
        assertEqual(enqueued, 2, 'enqueued up to max');
        await service.flushBarrier();
        assert(!chunks[0]!.isPersistenceDirty() && !chunks[1]!.isPersistenceDirty(), 'first two saved+clean');
        assert(chunks[2]!.isPersistenceDirty() && chunks[3]!.isPersistenceDirty(), 'remaining still dirty');
        const enqueued2 = await service.saveSomeDirty(chunks, 10);
        assertEqual(enqueued2, 2, 'second pass saves the remaining dirty chunks');
        await service.flushBarrier();
        assert(chunks.every((c) => !c.isPersistenceDirty()), 'all clean after second pass');
        await service.close();
        await backend.close();
      },
    },
    {
      name: `${label}: unload is a one-shot state transition (save final revision, resolve on success)`,
      run: async () => {
        const backend = makeBackend();
        const service = new WorldPersistenceService({ backend });
        await service.open('w');
        const chunk = makeDirtyChunk(5, 5);
        await service.requestUnload(chunk); // resolves only after the write succeeds
        assert(!chunk.isPersistenceDirty(), 'chunk clean after the unload save');
        const stored = await backend.readChunk('w', 5, 5);
        assert(stored !== undefined, 'unloaded chunk persisted');
        assertEqual(service.getStats().pendingUnloads, 0, 'unload entry cleared after completion');
        await service.close();
        await backend.close();
      },
    },
    {
      name: `${label}: cancelUnload stops the save when the chunk is wanted again (no unbounded loop)`,
      run: async () => {
        const backend = makeBackend();
        const service = new WorldPersistenceService({ backend });
        await service.open('w');
        const chunk = makeDirtyChunk(6, 6);
        const unloadPromise = service.requestUnload(chunk);
        service.cancelUnload(chunk); // wanted again before the write runs
        await unloadPromise; // resolves (task no-ops)
        assert(chunk.isPersistenceDirty(), 'canceled unload leaves the chunk dirty (not saved)');
        const stored = await backend.readChunk('w', 6, 6);
        assert(stored === undefined, 'no record written for a canceled unload');
        await service.close();
        await backend.close();
      },
    },
    {
      name: `${label}: forced-save bridge ordering — forcedSave covers earlier background writes, then metadata+barrier+close`,
      run: async () => {
        const backend = makeBackend();
        const service = new WorldPersistenceService({ backend });
        await service.open('w');
        const bg = makeDirtyChunk(2, 2);
        await service.saveSomeDirty([bg], 1); // background write accepted before forced save
        const chunks = [makeDirtyChunk(0, 0), makeDirtyChunk(1, 1)];
        await service.forcedSave(chunks);
        assert(!chunks[0]!.isPersistenceDirty() && !chunks[1]!.isPersistenceDirty(), 'forced-saved chunks clean');
        assert(!bg.isPersistenceDirty(), 'earlier background write covered by the barrier');
        await service.saveMetadata(makeMetadata('w'), WRITE_PRIORITY_FORCED);
        await service.flushBarrier();
        await service.close();
        const meta = await backend.readRecord('w', 'metadata');
        assert(meta !== undefined, 'final metadata persisted');
        await backend.close();
      },
    },
    {
      name: `${label}: forced save rejects if a covered chunk write fails (no false success)`,
      run: async () => {
        const backend = makeBackend();
        if (backend instanceof MemoryStorageBackend) {
          backend.setFailureInjector((op, key) => (op === 'writeChunk' && key.includes('7,7') ? new Error('injected chunk write failure') : undefined));
        } else {
          return; // per-key failure injection is a memory-backend feature; covered there
        }
        const service = new WorldPersistenceService({ backend });
        await service.open('w');
        const dirty = [makeDirtyChunk(6, 6), makeDirtyChunk(7, 7)];
        let rejected = false;
        try {
          await service.forcedSave(dirty);
        } catch (error) {
          rejected = true;
          assert(error instanceof Error && error.message.includes('injected'), 'forcedSave exposes the covered write failure');
        }
        assert(rejected, 'forcedSave rejects when a covered chunk write fails');
        assert(dirty[1]!.isPersistenceDirty(), 'the failed chunk is NOT marked clean');
        await service.close();
        await backend.close();
      },
    },
    {
      name: `${label}: closing rejects new background writes and new reads`,
      run: async () => {
        const { service, backend } = await makeOpenService(makeBackend);
        const dirty = [makeDirtyChunk(0, 0), makeDirtyChunk(0, 1)];
        const forcedPromise = service.forcedSave(dirty); // sets closing synchronously
        let bgRejected = false;
        await service.saveChunk(makeDirtyChunk(5, 5), WRITE_PRIORITY_BACKGROUND).catch(() => { bgRejected = true; });
        assert(bgRejected, 'background write rejected while closing');
        let readRejected = false;
        await service.loadChunk(9, 9).catch(() => { readRejected = true; });
        assert(readRejected, 'read rejected while closing');
        await forcedPromise;
        assert(!dirty[0]!.isPersistenceDirty() && !dirty[1]!.isPersistenceDirty(), 'forced-saved chunks clean');
        await service.close();
        await backend.close();
      },
    },
    {
      name: `${label}: close settles accepted work, rejects new service ops, but keeps the shared backend open`,
      run: async () => {
        const { backend, service } = await makeOpenService(makeBackend);
        const chunk = makeDirtyChunk(4, 4);
        const savePromise = service.saveChunk(chunk);
        await service.close();
        assert(!chunk.isPersistenceDirty(), 'accepted write settled before close completed');
        await savePromise;
        assert(service.isClosed, 'service reports closed');
        let serviceRejected = false;
        await service.loadChunk(4, 4).catch(() => { serviceRejected = true; });
        assert(serviceRejected, 'service rejects new reads after close');
        const stillThere = await backend.readChunk('w', 4, 4);
        assert(stillThere !== undefined, 'shared backend remains open after service close (record still stored)');
        await backend.close();
      },
    },
    {
      name: `${label}: closing one service keeps the shared backend usable for another world (amendment 3)`,
      run: async () => {
        const backend = makeBackend();
        const serviceA = new WorldPersistenceService({ backend });
        await serviceA.open('world-a');
        const chunk = makeDirtyChunk(0, 0);
        await serviceA.saveChunk(chunk);
        await serviceA.close();
        assert(serviceA.isClosed, 'service A closed');
        const serviceB = new WorldPersistenceService({ backend });
        await serviceB.open('world-b'); // would fail if the backend had been closed by service A
        const loaded = await serviceB.loadChunk(0, 0);
        assert(loaded === undefined, 'world-b is isolated from world-a (no chunk)');
        const aChunk = await backend.readChunk('world-a', 0, 0);
        assert(aChunk !== undefined, 'world-a data persists in the shared backend after its service closed');
        await serviceB.close();
        await backend.close(); // the application closes the backend explicitly
      },
    },
    {
      name: `${label}: world-scoped records (metadata/player) round-trip via write+read lanes`,
      run: async () => {
        const { service, backend } = await makeOpenService(makeBackend);
        const meta = new TextEncoder().encode('{"name":"test"}');
        await service.writeRecord('metadata', meta);
        const read = await service.readRecord('metadata');
        assert(read !== undefined && bytesEqual(read, meta), 'metadata record round-trips');
        const absent = await service.readRecord('player');
        assert(absent === undefined, 'absent record returns undefined');
        await service.close();
        await backend.close();
      },
    },
    {
      name: `${label}: savedAt is carried from the injected clock (diagnostic only)`,
      run: async () => {
        const { backend, service } = await makeOpenService(makeBackend, { clock: () => 777 });
        const chunk = makeDirtyChunk(2, 2);
        await service.saveChunk(chunk);
        const stored = await backend.readChunk('w', 2, 2);
        assert(stored !== undefined, 'record stored');
        const record = decodeChunkRecord(stored!);
        assertEqual(record.savedAtMs, 777, 'savedAt comes from the injected clock');
        assertEqual(record.chunkX, 2, 'record stores chunkX');
        assertEqual(record.chunkZ, 2, 'record stores chunkZ');
        await service.close();
        await backend.close();
      },
    },
  ];
}

await runSuite('persistence2.backend.memory', backendContractCases(memoryFactory, 'memory'));
await runSuite('persistence2.backend.idb', backendContractCases(idbFactory, 'idb'));
await runSuite('persistence2.backend.memorySpecific', memorySpecificCases());
await runSuite('persistence2.service.memory', serviceCases(memoryFactory, 'memory'));
await runSuite('persistence2.service.idb', serviceCases(idbFactory, 'idb'));
console.log('validatePersistence2Service: all suites passed (memory + IndexedDB parity).');
