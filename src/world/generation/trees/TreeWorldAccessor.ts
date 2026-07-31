import type { BlockId } from '../../../blocks/BlockId';
import { BlockIds } from '../../../blocks/BlockId';
import { CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z } from '../../chunkConstants';
import { chunkKey } from '../../chunkKey';
import { BetaTerrainGenerator } from '../BetaTerrainGenerator';
import { SurfaceGenerator } from '../SurfaceGenerator';
import { BetaCaveGenerator } from '../caves/BetaCaveGenerator';
import { JavaRandom } from '../random/JavaRandom';

/**
 * World-space read/write surface feature generators are ported against.
 * Supports optional block metadata (tall grass / fern) for population parity.
 */
export interface TreeWorldAccessor {
  getBlock(worldX: number, worldY: number, worldZ: number): BlockId;
  setBlock(worldX: number, worldY: number, worldZ: number, blockId: BlockId): void;
  getBlockMetadata?(worldX: number, worldY: number, worldZ: number): number;
  setBlockMetadata?(worldX: number, worldY: number, worldZ: number, metadata: number): void;
  /** Convenience: set id + metadata atomically when supported. */
  setBlockWithMetadata?(
    worldX: number,
    worldY: number,
    worldZ: number,
    blockId: BlockId,
    metadata: number,
  ): void;
  getHeight(worldX: number, worldZ: number): number;
}

function localIndex(localX: number, localY: number, localZ: number): number {
  return localX + localZ * CHUNK_SIZE_X + localY * CHUNK_SIZE_X * CHUNK_SIZE_Z;
}

function floorDiv(value: number, divisor: number): number {
  return Math.floor(value / divisor);
}

const NON_OPAQUE = new Set<BlockId>([
  0,
  BlockIds.Water,
  BlockIds.WaterFlowing,
  BlockIds.WaterStill,
  BlockIds.Lava,
  BlockIds.LavaFlowing,
  BlockIds.LavaStill,
]);

export function isNonOpaque(blockId: BlockId): boolean {
  return NON_OPAQUE.has(blockId);
}

export interface ScratchWorldStats {
  blockReads: number;
  blockWrites: number;
  chunkLookups: number;
  heightQueries: number;
  neighborBaseMs: number;
  neighborTerrainMs: number;
  neighborSurfaceMs: number;
  neighborCavesMs: number;
  neighborChunksGenerated: number;
  neighborCacheHits: number;
  neighborCacheMisses: number;
  heightmapComputations: number;
}

export class ScratchTreeWorld implements TreeWorldAccessor {
  private readonly terrainGenerator: BetaTerrainGenerator;
  private readonly worldSeed: bigint;
  private readonly chunkBlocks = new Map<number, Uint8Array>();
  private readonly chunkMetadata = new Map<number, Uint8Array>();
  private readonly chunkHeightmaps = new Map<number, Int16Array>();
  private readonly enableCaves: boolean;
  private targetChunkX = 0;
  private targetChunkZ = 0;
  private hasTarget = false;

  // ---- Instrumentation (Wave 1A – profiling only, no behavior change) ----
  private _blockReads = 0;
  private _blockWrites = 0;
  private _chunkLookups = 0;
  private _heightQueries = 0;
  private _neighborBaseMs = 0;
  private _neighborTerrainMs = 0;
  private _neighborSurfaceMs = 0;
  private _neighborCavesMs = 0;
  private _neighborChunksGenerated = 0;
  private _neighborCacheHits = 0;
  private _neighborCacheMisses = 0;
  private _heightmapComputations = 0;

  public constructor(worldSeed: bigint, terrainGenerator: BetaTerrainGenerator, enableCaves: boolean) {
    this.worldSeed = worldSeed;
    this.terrainGenerator = terrainGenerator;
    this.enableCaves = enableCaves;
  }

  public seedTargetChunk(
    chunkX: number,
    chunkZ: number,
    blocks: Uint8Array,
    metadata?: Uint8Array,
  ): void {
    this.targetChunkX = chunkX;
    this.targetChunkZ = chunkZ;
    this.hasTarget = true;
    this.chunkBlocks.set(chunkKey(chunkX, chunkZ), blocks);
    const meta = metadata ?? new Uint8Array(blocks.length);
    this.chunkMetadata.set(chunkKey(chunkX, chunkZ), meta);
    // Reset per-target stats
    this._blockReads = 0;
    this._blockWrites = 0;
    this._chunkLookups = 0;
    this._heightQueries = 0;
    this._neighborBaseMs = 0;
    this._neighborTerrainMs = 0;
    this._neighborSurfaceMs = 0;
    this._neighborCavesMs = 0;
    this._neighborChunksGenerated = 0;
    this._neighborCacheHits = 0;
    this._neighborCacheMisses = 0;
    this._heightmapComputations = 0;
  }

  public getScratchBlocks(chunkX: number, chunkZ: number): Uint8Array | undefined {
    this._chunkLookups++;
    return this.chunkBlocks.get(chunkKey(chunkX, chunkZ));
  }

  public getScratchMetadata(chunkX: number, chunkZ: number): Uint8Array | undefined {
    this._chunkLookups++;
    return this.chunkMetadata.get(chunkKey(chunkX, chunkZ));
  }

  public getBlock(worldX: number, worldY: number, worldZ: number): BlockId {
    this._blockReads++;
    if (worldY < 0 || worldY >= CHUNK_SIZE_Y) return 0;
    const chunkX = floorDiv(worldX, CHUNK_SIZE_X);
    const chunkZ = floorDiv(worldZ, CHUNK_SIZE_Z);
    const localX = worldX - chunkX * CHUNK_SIZE_X;
    const localZ = worldZ - chunkZ * CHUNK_SIZE_Z;
    const blocks = this.ensureChunk(chunkX, chunkZ);
    return blocks[localIndex(localX, worldY, localZ)]!;
  }

  public getBlockMetadata(worldX: number, worldY: number, worldZ: number): number {
    this._blockReads++;
    if (worldY < 0 || worldY >= CHUNK_SIZE_Y) return 0;
    const chunkX = floorDiv(worldX, CHUNK_SIZE_X);
    const chunkZ = floorDiv(worldZ, CHUNK_SIZE_Z);
    const localX = worldX - chunkX * CHUNK_SIZE_X;
    const localZ = worldZ - chunkZ * CHUNK_SIZE_Z;
    this.ensureChunk(chunkX, chunkZ);
    this._chunkLookups++;
    const meta = this.chunkMetadata.get(chunkKey(chunkX, chunkZ));
    return meta?.[localIndex(localX, worldY, localZ)] ?? 0;
  }

  public setBlock(worldX: number, worldY: number, worldZ: number, blockId: BlockId): void {
    this._blockWrites++;
    if (worldY < 0 || worldY >= CHUNK_SIZE_Y) return;
    const chunkX = floorDiv(worldX, CHUNK_SIZE_X);
    const chunkZ = floorDiv(worldZ, CHUNK_SIZE_Z);
    const localX = worldX - chunkX * CHUNK_SIZE_X;
    const localZ = worldZ - chunkZ * CHUNK_SIZE_Z;
    const blocks = this.ensureChunk(chunkX, chunkZ);
    const idx = localIndex(localX, worldY, localZ);
    blocks[idx] = blockId;
    this._chunkLookups++;
    const meta = this.chunkMetadata.get(chunkKey(chunkX, chunkZ));
    if (meta) meta[idx] = 0;
    this.chunkHeightmaps.delete(chunkKey(chunkX, chunkZ));
  }

  public setBlockMetadata(worldX: number, worldY: number, worldZ: number, metadata: number): void {
    this._blockWrites++;
    if (worldY < 0 || worldY >= CHUNK_SIZE_Y) return;
    const chunkX = floorDiv(worldX, CHUNK_SIZE_X);
    const chunkZ = floorDiv(worldZ, CHUNK_SIZE_Z);
    const localX = worldX - chunkX * CHUNK_SIZE_X;
    const localZ = worldZ - chunkZ * CHUNK_SIZE_Z;
    this.ensureChunk(chunkX, chunkZ);
    this._chunkLookups++;
    const meta = this.chunkMetadata.get(chunkKey(chunkX, chunkZ));
    if (meta) meta[localIndex(localX, worldY, localZ)] = metadata & 0xff;
  }

  public setBlockWithMetadata(
    worldX: number,
    worldY: number,
    worldZ: number,
    blockId: BlockId,
    metadata: number,
  ): void {
    this._blockWrites++;
    if (worldY < 0 || worldY >= CHUNK_SIZE_Y) return;
    const chunkX = floorDiv(worldX, CHUNK_SIZE_X);
    const chunkZ = floorDiv(worldZ, CHUNK_SIZE_Z);
    const localX = worldX - chunkX * CHUNK_SIZE_X;
    const localZ = worldZ - chunkZ * CHUNK_SIZE_Z;
    const blocks = this.ensureChunk(chunkX, chunkZ);
    const idx = localIndex(localX, worldY, localZ);
    blocks[idx] = blockId;
    this._chunkLookups++;
    const meta = this.chunkMetadata.get(chunkKey(chunkX, chunkZ));
    if (meta) meta[idx] = metadata & 0xff;
    this.chunkHeightmaps.delete(chunkKey(chunkX, chunkZ));
  }

  public getHeight(worldX: number, worldZ: number): number {
    this._heightQueries++;
    const chunkX = floorDiv(worldX, CHUNK_SIZE_X);
    const chunkZ = floorDiv(worldZ, CHUNK_SIZE_Z);
    const localX = worldX - chunkX * CHUNK_SIZE_X;
    const localZ = worldZ - chunkZ * CHUNK_SIZE_Z;
    const key = chunkKey(chunkX, chunkZ);
    this._chunkLookups++;
    let heightmap = this.chunkHeightmaps.get(key);
    if (heightmap === undefined) {
      heightmap = this.computeHeightmap(this.ensureChunk(chunkX, chunkZ));
      this.chunkHeightmaps.set(key, heightmap);
    }
    return heightmap[localZ * CHUNK_SIZE_X + localX]!;
  }

  public getStats(): ScratchWorldStats {
    return {
      blockReads: this._blockReads,
      blockWrites: this._blockWrites,
      chunkLookups: this._chunkLookups,
      heightQueries: this._heightQueries,
      neighborBaseMs: this._neighborBaseMs,
      neighborTerrainMs: this._neighborTerrainMs,
      neighborSurfaceMs: this._neighborSurfaceMs,
      neighborCavesMs: this._neighborCavesMs,
      neighborChunksGenerated: this._neighborChunksGenerated,
      neighborCacheHits: this._neighborCacheHits,
      neighborCacheMisses: this._neighborCacheMisses,
      heightmapComputations: this._heightmapComputations,
    };
  }

  private ensureChunk(chunkX: number, chunkZ: number): Uint8Array {
    const key = chunkKey(chunkX, chunkZ);
    this._chunkLookups++;
    let blocks = this.chunkBlocks.get(key);
    if (blocks === undefined) {
      // Cache miss – must generate raw terrain + surface + caves.
      const baseStart = performance.now();
      const t0 = performance.now();
      const raw = this.terrainGenerator.generate(chunkX, chunkZ);
      const t1 = performance.now();
      // These single-use generators are intentionally NOT reused in Wave 1A
      // – mutable-state audit required before singleton reuse (amendment 3).
      const surfaceGenerator = new SurfaceGenerator(
        new JavaRandom(0),
        this.terrainGenerator.surfaceSandNoise,
        this.terrainGenerator.surfaceDepthNoise,
      );
      surfaceGenerator.apply(chunkX, chunkZ, raw.blocks, raw.climate);
      const t2 = performance.now();
      if (this.enableCaves) {
        const caveGenerator = new BetaCaveGenerator(this.worldSeed);
        caveGenerator.carve(chunkX, chunkZ, raw.blocks);
      }
      const t3 = performance.now();

      this._neighborTerrainMs += t1 - t0;
      this._neighborSurfaceMs += t2 - t1;
      this._neighborCavesMs += t3 - t2;
      this._neighborBaseMs += t3 - baseStart;
      this._neighborChunksGenerated++;
      this._neighborCacheMisses++;

      blocks = raw.blocks;
      this.chunkBlocks.set(key, blocks);
      this.chunkMetadata.set(key, new Uint8Array(blocks.length));
    } else {
      // Hit – target chunk or previously generated neighbor in this same
      // decorate() call. Not counted as cache hit for LRU (which does not yet
      // exist in Wave 1A), but we track as hit for future comparison.
      if (chunkX !== this.targetChunkX || chunkZ !== this.targetChunkZ) {
        this._neighborCacheHits++;
      }
      if (!this.chunkMetadata.has(key)) {
        this.chunkMetadata.set(key, new Uint8Array(blocks.length));
      }
    }
    return blocks;
  }

  private computeHeightmap(blocks: Uint8Array): Int16Array {
    this._heightmapComputations++;
    const map = new Int16Array(CHUNK_SIZE_X * CHUNK_SIZE_Z);
    for (let z = 0; z < CHUNK_SIZE_Z; z++) {
      for (let x = 0; x < CHUNK_SIZE_X; x++) {
        let y = CHUNK_SIZE_Y - 1;
        while (y >= 0 && isNonOpaque(blocks[localIndex(x, y, z)]!)) {
          y--;
        }
        map[z * CHUNK_SIZE_X + x] = y + 1;
      }
    }
    return map;
  }

  /** Whether the given chunk is the decorate target (for diagnostics). */
  public isTargetChunk(chunkX: number, chunkZ: number): boolean {
    return this.hasTarget && chunkX === this.targetChunkX && chunkZ === this.targetChunkZ;
  }
}
