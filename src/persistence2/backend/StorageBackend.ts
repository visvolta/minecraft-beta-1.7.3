/**
 * Narrow, swappable storage backend. The persistence service depends only on
 * this interface — never on IndexedDB directly. Transaction ownership lives
 * inside each backend; raw transactions are never exposed. Every operation
 * returns a promise that resolves or rejects (no fire-and-forget, no timers).
 *
 * Two implementations are provided:
 *   - `IdbStorageBackend`    (production; IndexedDB)
 *   - `MemoryStorageBackend` (deterministic Node tests; injected failures/delays)
 * Both implement the same completion/failure semantics, including `flush`
 * barriers and `close`-after-settle.
 *
 * Records are opaque bytes; framing/versioning is handled by the codec layer
 * above the backend. Chunks, world records (metadata/player) and the world
 * index use separate logical namespaces / object stores.
 */

export interface WorldSummary {
  worldId: string;
  name: string;
  displayName: string;
  formatVersion: number;
  /** GameMode value (e.g. 'survival'/'creative'); stored as a string to keep the backend game-agnostic. */
  gameMode: string;
  seed: string;
  generatorVersion: string;
  saveVersion: number;
  createdAtMs: number;
  lastPlayedMs: number;
}

/** Deterministic logical key for a chunk record. */
export function chunkRecordKey(worldId: string, chunkX: number, chunkZ: number): string {
  return `world/${worldId}/chunk/${chunkX},${chunkZ}`;
}

/** Deterministic logical key for a world-scoped record (metadata, player, …). */
export function worldRecordKey(worldId: string, key: string): string {
  return `world/${worldId}/record/${key}`;
}

export interface StorageBackend {
  /** Open the underlying store. Idempotent per backend instance. */
  open(): Promise<void>;

  /** Returns the stored chunk record bytes, or `undefined` if absent (not an error). */
  readChunk(worldId: string, chunkX: number, chunkZ: number): Promise<Uint8Array | undefined>;
  /** Atomically writes one chunk record (one bounded transaction in IDB). */
  writeChunk(worldId: string, chunkX: number, chunkZ: number, record: Uint8Array): Promise<void>;
  deleteChunk(worldId: string, chunkX: number, chunkZ: number): Promise<void>;

  /** World-scoped records (metadata, player). `undefined` if absent. */
  readRecord(worldId: string, key: string): Promise<Uint8Array | undefined>;
  writeRecord(worldId: string, key: string, value: Uint8Array): Promise<void>;
  deleteRecord(worldId: string, key: string): Promise<void>;

  /** World index. */
  listWorlds(): Promise<WorldSummary[]>;
  upsertWorld(summary: WorldSummary): Promise<void>;
  deleteWorld(worldId: string): Promise<void>;

  /** Resolves once every write accepted so far has settled at the backend. */
  flush(): Promise<void>;
  /** Rejects new work and resolves once accepted work has settled, then closes. */
  close(): Promise<void>;
}
