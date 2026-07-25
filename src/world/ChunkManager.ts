import { Chunk } from './Chunk';
import { chunkKey } from './chunkKey';

/**
 * Sole owner of loaded chunks in memory.
 * Create / lookup / remove only — no terrain, meshing, or rendering.
 */
export class ChunkManager {
  private readonly chunks = new Map<number, Chunk>();
  private readonly renderDirtyChunks = new Set<Chunk>();
  private readonly persistenceDirtyChunks = new Set<Chunk>();
  private readonly removeListeners: Array<(chunk: Chunk) => void> = [];
  private readonly createListeners: Array<(chunk: Chunk) => void> = [];

  public get size(): number {
    return this.chunks.size;
  }

  public hasChunk(chunkX: number, chunkZ: number): boolean {
    return this.chunks.has(this.key(chunkX, chunkZ));
  }

  /**
   * Returns the chunk if loaded; does not create one.
   */
  public getChunk(chunkX: number, chunkZ: number): Chunk | undefined {
    return this.chunks.get(this.key(chunkX, chunkZ));
  }

  /**
   * Returns the existing chunk, or creates, stores, and returns a new one.
   */
  public getOrCreateChunk(chunkX: number, chunkZ: number): Chunk {
    const mapKey = this.key(chunkX, chunkZ);
    const existing = this.chunks.get(mapKey);

    if (existing !== undefined) {
      return existing;
    }

    const chunk = new Chunk(chunkX, chunkZ);
    this.chunks.set(mapKey, chunk);
    this.attachDirtyTracking(chunk);
    for (const listener of this.createListeners) listener(chunk);
    return chunk;
  }

  /**
   * Removes a loaded chunk.
   * @returns true if a chunk was removed, false if it was not loaded.
   */
  public removeChunk(chunkX: number, chunkZ: number): boolean {
    const mapKey = this.key(chunkX, chunkZ);
    const chunk = this.chunks.get(mapKey);
    if (chunk === undefined) return false;
    for (const listener of this.removeListeners) listener(chunk);
    this.renderDirtyChunks.delete(chunk);
    this.persistenceDirtyChunks.delete(chunk);
    chunk.setDirtyTrackingListeners(undefined, undefined);
    return this.chunks.delete(mapKey);
  }

  public addRemoveListener(listener: (chunk: Chunk) => void): void {
    if (!this.removeListeners.includes(listener)) {
      this.removeListeners.push(listener);
    }
  }

  public addCreateListener(listener: (chunk: Chunk) => void): void {
    if (!this.createListeners.includes(listener)) {
      this.createListeners.push(listener);
    }
  }

  public clear(): void {
    for (const chunk of this.chunks.values()) chunk.setDirtyTrackingListeners(undefined, undefined);
    this.chunks.clear();
    this.renderDirtyChunks.clear();
    this.persistenceDirtyChunks.clear();
  }

  public getRenderDirtyChunks(): ReadonlySet<Chunk> {
    return this.renderDirtyChunks;
  }

  public getPersistenceDirtyChunks(): ReadonlySet<Chunk> {
    return this.persistenceDirtyChunks;
  }

  /** Number of currently loaded chunks awaiting a mesh rebuild. */
  public countDirtyChunks(): number {
    return this.renderDirtyChunks.size;
  }

  public countPersistenceDirtyChunks(): number {
    return this.persistenceDirtyChunks.size;
  }

  public forEach(callback: (chunk: Chunk) => void): void {
    for (const chunk of this.chunks.values()) {
      callback(chunk);
    }
  }

  public [Symbol.iterator](): IterableIterator<Chunk> {
    return this.chunks.values();
  }

  private attachDirtyTracking(chunk: Chunk): void {
    chunk.setDirtyTrackingListeners(
      (dirtyChunk, dirty) => {
        if (dirty) this.renderDirtyChunks.add(dirtyChunk);
        else this.renderDirtyChunks.delete(dirtyChunk);
      },
      (dirtyChunk, dirty) => {
        if (dirty) this.persistenceDirtyChunks.add(dirtyChunk);
        else this.persistenceDirtyChunks.delete(dirtyChunk);
      },
    );
    if (chunk.isDirty()) this.renderDirtyChunks.add(chunk);
    if (chunk.isPersistenceDirty()) this.persistenceDirtyChunks.add(chunk);
  }

  private key(chunkX: number, chunkZ: number): number {
    return chunkKey(chunkX, chunkZ);
  }
}
