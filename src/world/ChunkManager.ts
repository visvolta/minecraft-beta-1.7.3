import { Chunk } from './Chunk';

/**
 * Sole owner of loaded chunks in memory.
 * Create / lookup / remove only — no terrain, meshing, or rendering.
 */
export class ChunkManager {
  private readonly chunks = new Map<string, Chunk>();

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
    return chunk;
  }

  /**
   * Removes a loaded chunk.
   * @returns true if a chunk was removed, false if it was not loaded.
   */
  public removeChunk(chunkX: number, chunkZ: number): boolean {
    return this.chunks.delete(this.key(chunkX, chunkZ));
  }

  public clear(): void {
    this.chunks.clear();
  }

  /**
   * Number of currently loaded chunks marked dirty (awaiting a mesh
   * rebuild). Debug-overlay-only; iterates all loaded chunks, so it's
   * O(loaded chunks) — fine at the small debug-overlay refresh rate,
   * not intended for per-frame gameplay use.
   */
  public countDirtyChunks(): number {
    let count = 0;

    for (const chunk of this.chunks.values()) {
      if (chunk.isDirty()) {
        count += 1;
      }
    }

    return count;
  }

  public forEach(callback: (chunk: Chunk) => void): void {
    for (const chunk of this.chunks.values()) {
      callback(chunk);
    }
  }

  public [Symbol.iterator](): IterableIterator<Chunk> {
    return this.chunks.values();
  }

  private key(chunkX: number, chunkZ: number): string {
    return `${chunkX},${chunkZ}`;
  }
}
