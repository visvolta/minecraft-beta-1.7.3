import type { BlockId } from '../blocks/BlockId';
import {
  AIR_BLOCK_ID,
  CHUNK_SIZE_X,
  CHUNK_SIZE_Y,
  CHUNK_SIZE_Z,
  CHUNK_VOLUME,
} from './chunkConstants';

/**
 * In-memory block storage for one Beta 1.7.3 chunk (16 × 128 × 16).
 *
 * Layout (XZY): index = x + z * CHUNK_SIZE_X + y * CHUNK_SIZE_X * CHUNK_SIZE_Z
 * — x fastest, then z, then y (horizontal layers stacked on Y).
 *
 * Data only: no meshing, lighting, neighbours, or world management.
 */
export class Chunk {
  public readonly chunkX: number;
  public readonly chunkZ: number;

  private readonly blocks: Uint8Array;
  private dirty: boolean;

  public constructor(chunkX: number, chunkZ: number) {
    this.chunkX = chunkX;
    this.chunkZ = chunkZ;
    this.blocks = new Uint8Array(CHUNK_VOLUME);
    // Air is 0; Uint8Array is zero-filled by default.
    this.dirty = true;
  }

  public isDirty(): boolean {
    return this.dirty;
  }

  public markDirty(): void {
    this.dirty = true;
  }

  public markClean(): void {
    this.dirty = false;
  }

  public isInBounds(localX: number, localY: number, localZ: number): boolean {
    return (
      localX >= 0 &&
      localX < CHUNK_SIZE_X &&
      localY >= 0 &&
      localY < CHUNK_SIZE_Y &&
      localZ >= 0 &&
      localZ < CHUNK_SIZE_Z
    );
  }

  /**
   * Returns the block ID at local coordinates.
   * Out of bounds returns Air (does not throw).
   */
  public getBlock(localX: number, localY: number, localZ: number): BlockId {
    if (!this.isInBounds(localX, localY, localZ)) {
      return AIR_BLOCK_ID;
    }

    return this.blocks[this.index(localX, localY, localZ)]!;
  }

  /**
   * Sets the block ID at local coordinates.
   * Out of bounds throws.
   * Marks dirty only when the value actually changes.
   */
  public setBlock(
    localX: number,
    localY: number,
    localZ: number,
    blockId: BlockId,
  ): void {
    if (!this.isInBounds(localX, localY, localZ)) {
      throw new RangeError(
        `Local block coordinates out of bounds: (${localX}, ${localY}, ${localZ})`,
      );
    }

    if (blockId < 0 || blockId > 255) {
      throw new RangeError(
        `Block ID ${blockId} does not fit in Uint8 storage (0–255).`,
      );
    }

    const i = this.index(localX, localY, localZ);
    if (this.blocks[i] === blockId) {
      return;
    }

    this.blocks[i] = blockId;
    this.dirty = true;
  }

  /**
   * Fills every block in the chunk with the given ID.
   * Marks dirty if any cell changes.
   */
  public fill(blockId: BlockId): void {
    if (blockId < 0 || blockId > 255) {
      throw new RangeError(
        `Block ID ${blockId} does not fit in Uint8 storage (0–255).`,
      );
    }

    let changed = false;

    for (let i = 0; i < this.blocks.length; i++) {
      if (this.blocks[i] !== blockId) {
        this.blocks[i] = blockId;
        changed = true;
      }
    }

    if (changed) {
      this.dirty = true;
    }
  }

  /**
   * Sets every block in a single Y layer (all local X/Z).
   * Marks dirty if any cell changes.
   */
  public setLayer(localY: number, blockId: BlockId): void {
    if (localY < 0 || localY >= CHUNK_SIZE_Y) {
      throw new RangeError(`Local Y out of bounds: ${localY}`);
    }

    if (blockId < 0 || blockId > 255) {
      throw new RangeError(
        `Block ID ${blockId} does not fit in Uint8 storage (0–255).`,
      );
    }

    const layerSize = CHUNK_SIZE_X * CHUNK_SIZE_Z;
    const start = localY * layerSize;
    let changed = false;

    for (let i = 0; i < layerSize; i++) {
      const index = start + i;
      if (this.blocks[index] !== blockId) {
        this.blocks[index] = blockId;
        changed = true;
      }
    }

    if (changed) {
      this.dirty = true;
    }
  }

  /**
   * Bulk-replaces every block in the chunk from a pre-built array using
   * the same XZY layout as this class's own storage (see index()).
   * Intended for world generators that build a full chunk's blocks
   * off-array (e.g. from noise) more efficiently than CHUNK_VOLUME
   * individual setBlock() calls. Always marks dirty, since this is only
   * ever used to populate a freshly created (already-dirty) chunk.
   */
  public loadGeneratedBlocks(data: Uint8Array): void {
    if (data.length !== CHUNK_VOLUME) {
      throw new RangeError(
        `Generated block array length ${data.length} does not match chunk volume ${CHUNK_VOLUME}.`,
      );
    }

    this.blocks.set(data);
    this.dirty = true;
  }

  /**
   * XZY flat index. Local coordinates must already be in bounds.
   */
  private index(localX: number, localY: number, localZ: number): number {
    return (
      localX +
      localZ * CHUNK_SIZE_X +
      localY * CHUNK_SIZE_X * CHUNK_SIZE_Z
    );
  }
}
