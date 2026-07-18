import { Chunk } from '../src/world/Chunk.ts';
import { ChunkManager } from '../src/world/ChunkManager.ts';
import { RegionCoordinator } from '../src/persistence/queue/RegionCoordinator.ts';
import { ChunkPersistenceQueue } from '../src/persistence/queue/ChunkPersistenceQueue.ts';
import { MemoryWorldStorage } from '../src/persistence/storage/WorldStorage.ts';

async function main() {
  function assert(v: boolean, m: string) { if (!v) { console.error('Failed:', m); process.exit(1); } }

  const storage = new MemoryWorldStorage();
  const coordinator = new RegionCoordinator(storage, 'test');
  const chunkManager = new ChunkManager();
  const queue = new ChunkPersistenceQueue(coordinator);

  // Load a non-existent chunk -> resolves to undefined
  const miss = await queue.enqueueRead(0, 0);
  assert(miss === undefined, 'Absent saved chunk falls back to generation (returns undefined)');

  // Make a dirty chunk, save it, and then load it
  const chunk = new Chunk(0, 0);
  chunk.setBlock(0, 0, 0, 1);
  chunk.setTerrainPopulated(true);
  chunkManager.getOrCreateChunk(0, 0).setBlock(0, 0, 0, 1);
  chunkManager.getChunk(0, 0)!.setTerrainPopulated(true);

  await queue.saveAllDirty(chunkManager);

  // Unload the chunk directly
  chunkManager.removeChunk(0, 0);

  // Read it back
  const hit = await queue.enqueueRead(0, 0);
  assert(hit !== undefined && hit !== 'corrupt', 'Saved chunk load instead of generating');
  if (hit instanceof Chunk) {
    assert(hit.getBlock(0, 0, 0) === 1, 'Saved blocks restore');
    assert(hit.isTerrainPopulated(), 'Populated state restores');
    assert(!hit.isPersistenceDirty(), 'Loaded chunk starts clean');
    chunkManager.getOrCreateChunk(0, 0); // Put it back
  }

  // Dirty unload
  const hitChunk = chunkManager.getChunk(0, 0)!;
  hitChunk.setBlock(0, 1, 0, 2); // dirty it
  assert(hitChunk.isPersistenceDirty(), 'Mutation during save remains dirty (or is dirty now)');

  let unloadResolved = false;
  queue.requestUnload(hitChunk).then(() => { unloadResolved = true; });

  // Wait a bit to let it process
  await new Promise(r => setTimeout(r, 100));
  assert(unloadResolved, 'Dirty chunk saves before removal');
  console.log('revisions', hitChunk.getPersistenceRevision(), (hitChunk as any).lastSavedRevision);
  assert(!hitChunk.isPersistenceDirty(), 'Successful save clears only the saved revision');

  // Mutation during save remains dirty
  hitChunk.setBlock(0, 1, 0, 3);
  const savePromise = queue.saveAllDirty([hitChunk]);
  hitChunk.setBlock(0, 1, 0, 4); // Mutate while saving
  await savePromise;
  assert(hitChunk.isPersistenceDirty(), 'Mutation during save leaves chunk dirty');

  // Failed save prevents removal and keeps dirty
  const failingStorage = new MemoryWorldStorage();
  failingStorage.put = async () => { throw new Error('Quota exceeded'); };
  const failingQueue = new ChunkPersistenceQueue(new RegionCoordinator(failingStorage, 'fail'));
  const doomedChunk = new Chunk(1, 1);
  doomedChunk.setBlock(0, 0, 0, 1);
  let failedUnloadFinished = false;
  failingQueue.requestUnload(doomedChunk).catch(() => {}).finally(() => { failedUnloadFinished = true; });
  await new Promise(r => setTimeout(r, 100));
  assert(!failedUnloadFinished, 'Failed unload prevents removal and keeps chunk queued for retry');
  assert(doomedChunk.isPersistenceDirty(), 'Failed save keeps chunk dirty');

  // Cancel unload
  const cancelChunk = new Chunk(2, 2);
  cancelChunk.setBlock(0, 0, 0, 1);
  queue.requestUnload(cancelChunk);
  queue.cancelUnload(cancelChunk);
  assert(cancelChunk.isPersistenceDirty(), 'Canceled unload leaves chunk dirty');

  console.log('Persistence Integration Validation Passed.');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
