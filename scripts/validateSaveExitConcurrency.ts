import { inflateSync } from 'node:zlib';
import { Chunk } from '../src/world/Chunk.ts';
import { ChunkManager } from '../src/world/ChunkManager.ts';
import { RegionCoordinator, type RegionOpener } from '../src/persistence/queue/RegionCoordinator.ts';
import { ChunkPersistenceQueue } from '../src/persistence/queue/ChunkPersistenceQueue.ts';
import { RegionStorage } from '../src/persistence/region/RegionStorage.ts';
import { MemoryWorldStorage, type WorldStorage } from '../src/persistence/storage/WorldStorage.ts';
import { decodeNbt } from '../src/persistence/nbt/NbtCodec.ts';
import { ChunkSerializer } from '../src/persistence/nbt/ChunkSerializer.ts';

/**
 * Validates the Save-and-Quit forced-flush architecture on a large dirty set:
 *   - getRegion() in-flight dedup (concurrent callers share one open/instance)
 *   - the region-bucketed sequential forced flush resolves for >=195 chunks
 *   - each distinct region is opened exactly once (no duplicate RegionStorage)
 *   - activeSaves returns to zero
 *   - chunks are only marked clean for the saved revision; re-dirty stays dirty
 *   - saved region data is durable and decodes back to the correct blocks
 *   - pending opens are cleared after success AND after failure
 *   - a later retry works after an open failure
 *
 * NOTE 1: This runs against in-memory storage, which resolves instantly. It does
 * NOT reproduce the real-browser IndexedDB stall; it verifies the NEW
 * coalesced/sequential architecture, not the original hang. The definitive
 * proof is the manual real-browser Save-and-Quit checklist.
 *
 * NOTE 2: Chunk integrity is verified with node:zlib + the production NBT/chunk
 * decoders instead of ChunkPersistenceQueue.enqueueRead, because
 * RegionFileCodec.getChunkData's DecompressionStream usage deadlocks in Node for
 * full-size chunks (a PRE-EXISTING bug, unrelated to this change). See the
 * review notes.
 */

const REGION_SPAN = 2; // regions rx,rz in {0,1} -> 4 regions
const LOCAL_PER_AXIS = 7; // 7x7 = 49 chunks per region -> 196 chunks total
const EXPECTED_REGIONS = REGION_SPAN * REGION_SPAN;
const EXPECTED_CHUNKS = EXPECTED_REGIONS * LOCAL_PER_AXIS * LOCAL_PER_AXIS;
const PROBE_BLOCK_ID = 42;
const HANG_WATCHDOG_MS = 20000;

function assert(v: boolean, m: string): void {
  if (!v) {
    console.error('Failed:', m);
    process.exit(1);
  }
}

/** Test seam: counts region opens/constructions and can be told to fail opens. */
interface OpenTracker {
  readonly opener: RegionOpener;
  readonly openCounts: Map<string, number>;
  readonly constructed: RegionStorage[];
  inFlight: number;
  peakInFlight: number;
  failKeys: Set<string>;
}

function makeOpenTracker(): OpenTracker {
  const openCounts = new Map<string, number>();
  const constructed: RegionStorage[] = [];
  const failKeys = new Set<string>();
  const tracker: OpenTracker = {
    openCounts,
    constructed,
    inFlight: 0,
    peakInFlight: 0,
    failKeys,
    opener: async (storage: WorldStorage, worldId: string, rx: number, rz: number) => {
      const key = `${rx},${rz}`;
      openCounts.set(key, (openCounts.get(key) ?? 0) + 1);
      if (failKeys.has(key)) {
        throw new Error(`injected open failure for region ${key}`);
      }
      tracker.inFlight += 1;
      tracker.peakInFlight = Math.max(tracker.peakInFlight, tracker.inFlight);
      try {
        const region = await RegionStorage.open(storage, worldId, rx, rz);
        constructed.push(region);
        return region;
      } finally {
        tracker.inFlight -= 1;
      }
    },
  };
  return tracker;
}

/** Deterministic, lightweight persistence-dirty chunks spread across regions. */
function populateDirtyWorld(cm: ChunkManager): Chunk[] {
  const created: Chunk[] = [];
  for (let rx = 0; rx < REGION_SPAN; rx++) {
    for (let rz = 0; rz < REGION_SPAN; rz++) {
      for (let lx = 0; lx < LOCAL_PER_AXIS; lx++) {
        for (let lz = 0; lz < LOCAL_PER_AXIS; lz++) {
          const chunkX = rx * 32 + lx;
          const chunkZ = rz * 32 + lz;
          const chunk = cm.getOrCreateChunk(chunkX, chunkZ);
          chunk.setBlock(5, 64, 7, PROBE_BLOCK_ID);
          chunk.setTerrainPopulated(true);
          assert(chunk.isPersistenceDirty(), `chunk (${chunkX},${chunkZ}) starts dirty`);
          created.push(chunk);
        }
      }
    }
  }
  return created;
}

function regionRecordKey(rx: number, rz: number): string {
  return `region/r.${rx}.${rz}.mcr`;
}

/**
 * Decodes a stored chunk directly from raw region bytes using node:zlib +
 * production NBT/chunk decoders. Bypasses RegionFileCodec.getChunkData (which
 * deadlocks in Node for full-size chunks). Mirrors the region sector layout.
 */
function decodeStoredChunk(regionBytes: Uint8Array, lx: number, lz: number): Chunk {
  const view = new DataView(regionBytes.buffer, regionBytes.byteOffset, regionBytes.byteLength);
  const index = (lx & 31) + (lz & 31) * 32;
  const offsetData = view.getInt32(index * 4, false);
  assert(offsetData !== 0, `stored chunk slot (${lx},${lz}) is populated in the region file`);
  const sectorOffset = (offsetData >> 8) & 0xffffff;
  const start = sectorOffset * 4096;
  const length = view.getInt32(start, false);
  const version = view.getUint8(start + 4);
  assert(version === 2, `stored chunk uses deflate version 2 (got ${version})`);
  const compressed = regionBytes.slice(start + 5, start + 4 + length);
  const nbtBytes = new Uint8Array(inflateSync(compressed));
  const decoded = decodeNbt(nbtBytes);
  const chunk = ChunkSerializer.decodeChunk(decoded.root, 0);
  chunk.markAsLoadedFromDisk();
  return chunk;
}

async function testConcurrentGetRegionDedup(): Promise<void> {
  const storage = new MemoryWorldStorage();
  const tracker = makeOpenTracker();
  const coordinator = new RegionCoordinator(storage, 'dedup', tracker.opener);

  // Fire many concurrent opens for the SAME uncached region; all must coalesce
  // into a single open and resolve to the same RegionStorage instance.
  const concurrent = 50;
  const promises: Promise<RegionStorage>[] = [];
  for (let i = 0; i < concurrent; i++) promises.push(coordinator.getRegion(0, 0));
  const regions = await Promise.all(promises);

  const first = regions[0]!;
  for (const region of regions) assert(region === first, 'all concurrent callers receive the same RegionStorage instance');
  assert(tracker.openCounts.get('0,0') === 1, `region opened exactly once under concurrency (got ${tracker.openCounts.get('0,0')})`);
  assert(tracker.constructed.length === 1, `exactly one RegionStorage constructed (got ${tracker.constructed.length})`);
  assert(tracker.inFlight === 0, 'no in-flight opens remain after concurrent getRegion settles');

  // A subsequent getRegion is a synchronous cache hit (no new open).
  const again = await coordinator.getRegion(0, 0);
  assert(again === first, 'cached region returned after open');
  assert(tracker.openCounts.get('0,0') === 1, 'cache hit does not reopen the region');

  console.log('  [ok] concurrent getRegion dedup: 50 callers -> 1 open, 1 instance');
}

async function testLargeSetForcedFlush(): Promise<void> {
  const storage = new MemoryWorldStorage();
  const tracker = makeOpenTracker();
  const coordinator = new RegionCoordinator(storage, 'large', tracker.opener);
  const queue = new ChunkPersistenceQueue(coordinator);
  const cm = new ChunkManager();
  const chunks = populateDirtyWorld(cm);

  assert(chunks.length === EXPECTED_CHUNKS, `created ${EXPECTED_CHUNKS} dirty chunks (got ${chunks.length})`);
  assert(EXPECTED_CHUNKS >= 195, 'dirty set is at least 195 chunks');

  // The forced flush must resolve for the whole large dirty set.
  await queue.saveAllDirty(cm);

  // Each distinct region opened exactly once (no duplicate RegionStorage).
  assert(tracker.openCounts.size === EXPECTED_REGIONS, `distinct regions opened == ${EXPECTED_REGIONS} (got ${tracker.openCounts.size})`);
  for (const [key, count] of tracker.openCounts) assert(count === 1, `region ${key} opened exactly once (got ${count})`);
  assert(tracker.constructed.length === EXPECTED_REGIONS, `exactly ${EXPECTED_REGIONS} RegionStorage constructed (got ${tracker.constructed.length})`);

  // activeSaves returns to zero and no opens are in flight.
  assert(queue.getStats().activeSaves === 0, `activeSaves returns to 0 (got ${queue.getStats().activeSaves})`);
  assert(tracker.inFlight === 0, 'no in-flight opens remain after the flush');

  // All chunks marked clean (saved revision matched at clean-mark time).
  for (const chunk of chunks) assert(!chunk.isPersistenceDirty(), `chunk (${chunk.chunkX},${chunk.chunkZ}) clean after forced flush`);

  // Durability: every region's bytes were committed to storage.
  for (let rx = 0; rx < REGION_SPAN; rx++) {
    for (let rz = 0; rz < REGION_SPAN; rz++) {
      const bytes = await storage.get('large', regionRecordKey(rx, rz));
      assert(bytes !== undefined && bytes.byteLength > 0, `region (${rx},${rz}) committed to storage`);
    }
  }

  // Structural validity: re-opening the probe region from storage via the
  // production open path (header parse) does not report corruption.
  const reopened = await RegionStorage.open(storage, 'large', 0, 0);
  assert(reopened !== undefined, 'saved region re-opens without corruption');

  // Content integrity: the probe chunk decodes back to the exact saved blocks
  // (via node:zlib + production decoders; see NOTE 2).
  const probeBytes = (await storage.get('large', regionRecordKey(0, 0)))!;
  const decoded = decodeStoredChunk(probeBytes, 0, 0);
  assert(decoded.getBlock(5, 64, 7) === PROBE_BLOCK_ID, 'saved block restores intact');
  assert(decoded.isTerrainPopulated(), 'saved populated flag restores intact');
  assert(!decoded.isPersistenceDirty(), 'decoded chunk starts clean');

  queue.dispose();
  console.log(`  [ok] large-set forced flush: ${EXPECTED_CHUNKS} chunks / ${EXPECTED_REGIONS} regions resolved, activeSaves=0, region data durable+decodable`);
}

async function testRevisionGuardDuringSave(): Promise<void> {
  const storage = new MemoryWorldStorage();
  const tracker = makeOpenTracker();
  const coordinator = new RegionCoordinator(storage, 'revision', tracker.opener);
  const queue = new ChunkPersistenceQueue(coordinator);

  const chunk = new Chunk(0, 0);
  chunk.setBlock(0, 0, 0, 1);
  chunk.setTerrainPopulated(true);

  // Mutate the chunk after the flush snapshots its revision but before the
  // clean-mark runs: it must remain dirty (only the saved revision is cleaned).
  const savePromise = queue.saveAllDirty([chunk]);
  chunk.setBlock(0, 1, 0, 2); // bumps persistenceRevision mid-save
  await savePromise;
  assert(chunk.isPersistenceDirty(), 'chunk modified during the save remains dirty');

  // Saving again now cleans it (revision matches at clean-mark time).
  await queue.saveAllDirty([chunk]);
  assert(!chunk.isPersistenceDirty(), 'subsequent save cleans the re-dirtied chunk');
  assert(queue.getStats().activeSaves === 0, 'activeSaves returns to 0 after revision-guard test');

  queue.dispose();
  console.log('  [ok] revision guard: mid-save mutation stays dirty; later save cleans it');
}

async function testFailureAndRetry(): Promise<void> {
  const storage = new MemoryWorldStorage();
  const tracker = makeOpenTracker();
  const coordinator = new RegionCoordinator(storage, 'failure', tracker.opener);
  const queue = new ChunkPersistenceQueue(coordinator);
  const cm = new ChunkManager();
  const chunks = populateDirtyWorld(cm);

  // Force opens of region (1,1) to fail.
  tracker.failKeys.add('1,1');

  let rejected = false;
  try {
    await queue.saveAllDirty(cm);
  } catch (err) {
    rejected = true;
    assert(err instanceof Error && err.message.includes('1,1'), 'failure propagates the original open error unchanged');
  }
  assert(rejected, 'forced flush rejects (fail-fast) when a region open fails');

  // Fail-fast: clean-marking never ran, so every chunk is still dirty.
  for (const chunk of chunks) assert(chunk.isPersistenceDirty(), `chunk (${chunk.chunkX},${chunk.chunkZ}) stays dirty after failed flush`);

  // Pending opens are cleared after the failure (no poisoned entry, nothing in flight).
  assert(tracker.inFlight === 0, 'no in-flight opens remain after a failed open');
  assert(queue.getStats().activeSaves === 0, 'activeSaves returns to 0 after failure');

  // Retry works: clearing the failure lets the flush re-open region (1,1) and complete.
  tracker.failKeys.delete('1,1');
  await queue.saveAllDirty(cm);
  for (const chunk of chunks) assert(!chunk.isPersistenceDirty(), `chunk (${chunk.chunkX},${chunk.chunkZ}) clean after successful retry`);
  assert(tracker.openCounts.get('1,1') === 2, `region (1,1) re-opened on retry (failed+success = 2, got ${tracker.openCounts.get('1,1')})`);
  assert(queue.getStats().activeSaves === 0, 'activeSaves returns to 0 after retry');
  assert(tracker.inFlight === 0, 'no in-flight opens remain after retry');

  queue.dispose();
  console.log('  [ok] failure + retry: fail-fast reject, pending open cleared, retry re-opens and completes');
}

async function main(): Promise<void> {
  // Guard against a silent false-pass: if any step hangs, fail loudly instead of
  // letting Node exit 0 when the event loop drains with main() still suspended.
  const hangWatchdog = setTimeout(() => {
    console.error(`Failed: validation did not complete within ${HANG_WATCHDOG_MS}ms (possible hang)`);
    process.exit(1);
  }, HANG_WATCHDOG_MS);

  try {
    console.log('Save/Exit concurrency validation (in-memory; architecture check, not a real-browser stall repro)');
    await testConcurrentGetRegionDedup();
    await testLargeSetForcedFlush();
    await testRevisionGuardDuringSave();
    await testFailureAndRetry();
    clearTimeout(hangWatchdog);
    console.log('Save/Exit Concurrency Validation Passed.');
  } catch (err) {
    clearTimeout(hangWatchdog);
    throw err;
  }
}

// On success we exit naturally (every queue is dispose()d and the watchdog is
// cleared, so the event loop drains) instead of process.exit(0), which would
// truncate buffered stdout and hide the summary. Failures force a non-zero exit
// via assert()/catch/the hang watchdog.
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
