/**
 * Per-generation-worker bounded LRU cache for raw terrain (terrain + surface + caves),
 * no decoration. Immutable entries: raw cache → scratch-local writable copy.
 *
 * Requirements from amendments:
 * - Cache identity includes world seed / dimension / chunk X,Z / generation config version.
 * - Cached entry is immutable template, never decorated directly.
 * - Metrics: hits, misses, evictions, copy ms, bytes copied, memory, hit rate.
 * - Bounded capacity 32-64, tuned from evidence (amend 7).
 * - Supports cache OFF vs ON for parity comparison (amend 20).
 */

import { chunkKey } from '../chunkKey';
import { CHUNK_VOLUME } from '../chunkConstants';

export interface RawCacheEntry {
  readonly blocks: Uint8Array; // immutable copy
  readonly chunkX: number;
  readonly chunkZ: number;
}

export interface RawCacheStats {
  hits: number;
  misses: number;
  evictions: number;
  copyMs: number;
  bytesCopied: number;
  memoryBytes: number;
  hitRate: number;
  currentSize: number;
}

export interface RawCacheIdentity {
  readonly worldSeed: bigint;
  readonly dimensionId: string; // e.g. 'overworld', 'nether', etc
  readonly enableCaves: boolean;
  readonly generationVersion: number; // bump when generation logic changes
}

const DEFAULT_CAPACITY = 48;
const BLOCK_BYTES = CHUNK_VOLUME; // 16*128*16 = 32768

export class RawTerrainCache {
  private readonly capacity: number;
  private readonly map = new Map<number, RawCacheEntry>();
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private copyMs = 0;
  private bytesCopied = 0;

  private currentIdentity: RawCacheIdentity | null = null;
  private enabled = true;

  public constructor(capacity = DEFAULT_CAPACITY) {
    this.capacity = capacity;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Checks if current world/dimension/config matches cached identity.
   * If not, clears cache (amend 4: do not return Overworld chunk for Nether, etc).
   */
  public ensureIdentity(identity: RawCacheIdentity): void {
    const cur = this.currentIdentity;
    if (
      cur === null ||
      cur.worldSeed !== identity.worldSeed ||
      cur.dimensionId !== identity.dimensionId ||
      cur.enableCaves !== identity.enableCaves ||
      cur.generationVersion !== identity.generationVersion
    ) {
      // Identity changed – clear to avoid cross-world leakage
      this.map.clear();
      this.hits = 0;
      this.misses = 0;
      this.evictions = 0;
      this.copyMs = 0;
      this.bytesCopied = 0;
      this.currentIdentity = identity;
    }
  }

  public clear(): void {
    this.map.clear();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    this.copyMs = 0;
    this.bytesCopied = 0;
  }

  public get(chunkX: number, chunkZ: number): Uint8Array | undefined {
    if (!this.enabled) {
      this.misses++;
      return undefined;
    }
    const key = chunkKey(chunkX, chunkZ);
    const entry = this.map.get(key);
    if (entry === undefined) {
      this.misses++;
      return undefined;
    }
    // LRU touch: delete and re-insert to move to end (most recent)
    this.map.delete(key);
    this.map.set(key, entry);
    this.hits++;

    const t0 = performance.now();
    const copy = new Uint8Array(entry.blocks); // immutable template → writable copy
    const dt = performance.now() - t0;
    this.copyMs += dt;
    this.bytesCopied += copy.byteLength;
    return copy;
  }

  public set(chunkX: number, chunkZ: number, blocks: Uint8Array): void {
    if (!this.enabled) return;
    const key = chunkKey(chunkX, chunkZ);
    // Store immutable copy, never the live array that will be decorated
    const t0 = performance.now();
    const immutableCopy = new Uint8Array(blocks); // copy for immutability
    const dt = performance.now() - t0;
    this.copyMs += dt;
    this.bytesCopied += immutableCopy.byteLength;

    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.capacity) {
      // Evict least recently used (first entry)
      const firstKey = this.map.keys().next().value as number | undefined;
      if (firstKey !== undefined) {
        this.map.delete(firstKey);
        this.evictions++;
      }
    }
    this.map.set(key, { blocks: immutableCopy, chunkX, chunkZ });
  }

  public getStats(): RawCacheStats {
    const total = this.hits + this.misses;
    const hitRate = total === 0 ? 0 : this.hits / total;
    return {
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      copyMs: this.copyMs,
      bytesCopied: this.bytesCopied,
      memoryBytes: this.map.size * BLOCK_BYTES,
      hitRate,
      currentSize: this.map.size,
    };
  }

  public getMemoryBytes(): number {
    return this.map.size * BLOCK_BYTES;
  }
}

// Global per-worker cache singleton – lives in worker scope, shared across decorate() calls
// but identity-checked per job. Tunable capacity 32-64, start 48, will be tuned via hit rate.
let globalPerWorkerCache: RawTerrainCache | null = null;

export function getGlobalRawTerrainCache(): RawTerrainCache {
  if (globalPerWorkerCache === null) {
    globalPerWorkerCache = new RawTerrainCache(DEFAULT_CAPACITY);
  }
  return globalPerWorkerCache;
}

export function clearGlobalRawTerrainCache(): void {
  globalPerWorkerCache?.clear();
}
