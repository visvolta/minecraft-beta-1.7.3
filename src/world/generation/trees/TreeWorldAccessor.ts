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
  }

  public getScratchBlocks(chunkX: number, chunkZ: number): Uint8Array | undefined {
    return this.chunkBlocks.get(chunkKey(chunkX, chunkZ));
  }

  public getScratchMetadata(chunkX: number, chunkZ: number): Uint8Array | undefined {
    return this.chunkMetadata.get(chunkKey(chunkX, chunkZ));
  }

  public getBlock(worldX: number, worldY: number, worldZ: number): BlockId {
    if (worldY < 0 || worldY >= CHUNK_SIZE_Y) return 0;
    const chunkX = floorDiv(worldX, CHUNK_SIZE_X);
    const chunkZ = floorDiv(worldZ, CHUNK_SIZE_Z);
    const localX = worldX - chunkX * CHUNK_SIZE_X;
    const localZ = worldZ - chunkZ * CHUNK_SIZE_Z;
    const blocks = this.ensureChunk(chunkX, chunkZ);
    return blocks[localIndex(localX, worldY, localZ)]!;
  }

  public getBlockMetadata(worldX: number, worldY: number, worldZ: number): number {
    if (worldY < 0 || worldY >= CHUNK_SIZE_Y) return 0;
    const chunkX = floorDiv(worldX, CHUNK_SIZE_X);
    const chunkZ = floorDiv(worldZ, CHUNK_SIZE_Z);
    const localX = worldX - chunkX * CHUNK_SIZE_X;
    const localZ = worldZ - chunkZ * CHUNK_SIZE_Z;
    this.ensureChunk(chunkX, chunkZ);
    const meta = this.chunkMetadata.get(chunkKey(chunkX, chunkZ));
    return meta?.[localIndex(localX, worldY, localZ)] ?? 0;
  }

  public setBlock(worldX: number, worldY: number, worldZ: number, blockId: BlockId): void {
    if (worldY < 0 || worldY >= CHUNK_SIZE_Y) return;
    const chunkX = floorDiv(worldX, CHUNK_SIZE_X);
    const chunkZ = floorDiv(worldZ, CHUNK_SIZE_Z);
    const localX = worldX - chunkX * CHUNK_SIZE_X;
    const localZ = worldZ - chunkZ * CHUNK_SIZE_Z;
    const blocks = this.ensureChunk(chunkX, chunkZ);
    const idx = localIndex(localX, worldY, localZ);
    blocks[idx] = blockId;
    const meta = this.chunkMetadata.get(chunkKey(chunkX, chunkZ));
    if (meta) meta[idx] = 0;
    this.chunkHeightmaps.delete(chunkKey(chunkX, chunkZ));
  }

  public setBlockMetadata(worldX: number, worldY: number, worldZ: number, metadata: number): void {
    if (worldY < 0 || worldY >= CHUNK_SIZE_Y) return;
    const chunkX = floorDiv(worldX, CHUNK_SIZE_X);
    const chunkZ = floorDiv(worldZ, CHUNK_SIZE_Z);
    const localX = worldX - chunkX * CHUNK_SIZE_X;
    const localZ = worldZ - chunkZ * CHUNK_SIZE_Z;
    this.ensureChunk(chunkX, chunkZ);
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
    if (worldY < 0 || worldY >= CHUNK_SIZE_Y) return;
    const chunkX = floorDiv(worldX, CHUNK_SIZE_X);
    const chunkZ = floorDiv(worldZ, CHUNK_SIZE_Z);
    const localX = worldX - chunkX * CHUNK_SIZE_X;
    const localZ = worldZ - chunkZ * CHUNK_SIZE_Z;
    const blocks = this.ensureChunk(chunkX, chunkZ);
    const idx = localIndex(localX, worldY, localZ);
    blocks[idx] = blockId;
    const meta = this.chunkMetadata.get(chunkKey(chunkX, chunkZ));
    if (meta) meta[idx] = metadata & 0xff;
    this.chunkHeightmaps.delete(chunkKey(chunkX, chunkZ));
  }

  public getHeight(worldX: number, worldZ: number): number {
    const chunkX = floorDiv(worldX, CHUNK_SIZE_X);
    const chunkZ = floorDiv(worldZ, CHUNK_SIZE_Z);
    const localX = worldX - chunkX * CHUNK_SIZE_X;
    const localZ = worldZ - chunkZ * CHUNK_SIZE_Z;
    const key = chunkKey(chunkX, chunkZ);
    let heightmap = this.chunkHeightmaps.get(key);
    if (heightmap === undefined) {
      heightmap = this.computeHeightmap(this.ensureChunk(chunkX, chunkZ));
      this.chunkHeightmaps.set(key, heightmap);
    }
    return heightmap[localZ * CHUNK_SIZE_X + localX]!;
  }

  private ensureChunk(chunkX: number, chunkZ: number): Uint8Array {
    const key = chunkKey(chunkX, chunkZ);
    let blocks = this.chunkBlocks.get(key);
    if (blocks === undefined) {
      const raw = this.terrainGenerator.generate(chunkX, chunkZ);
      const surfaceGenerator = new SurfaceGenerator(
        new JavaRandom(0),
        this.terrainGenerator.surfaceSandNoise,
        this.terrainGenerator.surfaceDepthNoise,
      );
      surfaceGenerator.apply(chunkX, chunkZ, raw.blocks, raw.climate);
      if (this.enableCaves) {
        const caveGenerator = new BetaCaveGenerator(this.worldSeed);
        caveGenerator.carve(chunkX, chunkZ, raw.blocks);
      }
      blocks = raw.blocks;
      this.chunkBlocks.set(key, blocks);
      this.chunkMetadata.set(key, new Uint8Array(blocks.length));
    } else if (!this.chunkMetadata.has(key)) {
      this.chunkMetadata.set(key, new Uint8Array(blocks.length));
    }
    return blocks;
  }

  private computeHeightmap(blocks: Uint8Array): Int16Array {
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
