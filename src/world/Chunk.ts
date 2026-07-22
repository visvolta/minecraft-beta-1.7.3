import type { BlockId } from '../blocks/BlockId';
import { BlockIds } from '../blocks/BlockId';
import { ScheduledTickQueue } from './ticks/ScheduledTickQueue';
import {
  AIR_BLOCK_ID,
  CHUNK_SIZE_X,
  CHUNK_SIZE_Y,
  CHUNK_SIZE_Z,
  CHUNK_VOLUME,
} from './chunkConstants';

/**
 * Blocks that do NOT count as "opaque" for heightmap purposes, matching
 * real Beta's `Block.a()` override (light-opacity flag): fluids return
 * false there (see BlockFluids.a()), so a column full of Stone up to
 * Y=63 topped with Water up to sea level still reports height 64 (the
 * top of the Stone), not the top of the Water. Every other block this
 * project currently generates (Stone/Grass/Dirt/Sand/Gravel/Bedrock/
 * Log/Leaves) is opaque by default and correctly counted.
 */
const NON_OPAQUE_FOR_HEIGHTMAP = new Set<BlockId>([
  AIR_BLOCK_ID,
  BlockIds.Water,
  BlockIds.Lava,
  BlockIds.LavaStill,
  BlockIds.Dandelion,
  BlockIds.Rose,
  BlockIds.BrownMushroom,
  BlockIds.RedMushroom,
  BlockIds.TallGrass,
  BlockIds.DeadBush,
  BlockIds.Reed,
]);

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
  private readonly metadata: Uint8Array;
  private readonly light: Uint8Array;
  private dirty: boolean;
  private blockRevision = 0;
  private metadataRevision = 0;
  private meshRevision = 0;
  private lightRevision = 0;
  private weatherRevision = 0;
  private persistenceRevision = 0;
  private lastSavedRevision = 0;
  private terrainPopulated = false;
  private corrupt = false;
  private readonly scheduledTicks = new ScheduledTickQueue(() => this.markPersistenceDirty());

  /**
   * Cached per-column height: for each (localX, localZ), one past the
   * topmost "opaque" block (matching real Beta's `world.d(x,z)`
   * heightmap semantics precisely — see NON_OPAQUE_FOR_HEIGHTMAP).
   * `undefined` until computed. Always derived purely from this chunk's
   * own `blocks` array (see recomputeHeightmap) — never reads or
   * depends on any neighbouring chunk's data or generation state, which
   * is what keeps tree placement (Stage 12C, the only current consumer)
   * fully order-independent despite real Beta's own heightmap lookup
   * being neighbour-generation-order-sensitive.
   */
  private heightmap: Int16Array | undefined;

  /**
   * Dedicated Beta precipitation-height cache. This is NOT the same as
   * the normal heightmap: vanilla rain/snow stops on the first solid OR
   * liquid material, so water/glass/leaves can block weather even when
   * other systems treat them as transparent/non-opaque.
   */
  private precipitationHeightmap: Int16Array | undefined;

  public constructor(chunkX: number, chunkZ: number) {
    this.chunkX = chunkX;
    this.chunkZ = chunkZ;
    this.blocks = new Uint8Array(CHUNK_VOLUME);
    this.metadata = new Uint8Array(CHUNK_VOLUME);
    this.light = new Uint8Array(CHUNK_VOLUME);
    // Air is 0; Uint8Array is zero-filled by default.
    this.dirty = true;
  }

  public isDirty(): boolean {
    return this.dirty;
  }

  public markDirty(): void {
    this.dirty = true;
    this.meshRevision += 1;
  }

  private markPersistenceDirty(): void {
    this.persistenceRevision += 1;
  }

  /**
   * Marks the chunk as needing a persistence re-save because its *entity*
   * membership changed (an entity spawned, was removed, or crossed into/out of
   * this chunk). Bumps only the persistence revision — block/mesh data is
   * untouched, so no visual dirtying occurs. Required so the EntityManager can
   * keep the saved `Entities` list correct and avoid duplicate entity saves
   * across chunk boundaries.
   */
  public markEntitiesDirty(): void {
    this.markPersistenceDirty();
  }

  public getPersistenceRevision(): number {
    return this.persistenceRevision;
  }

  public isPersistenceDirty(): boolean {
    return this.persistenceRevision !== this.lastSavedRevision;
  }

  public markPersistenceClean(savedRevision: number): void {
    if (this.lastSavedRevision < savedRevision) {
      this.lastSavedRevision = savedRevision;
    }
  }

  public markAsLoadedFromDisk(): void {
    this.lastSavedRevision = this.persistenceRevision;
  }

  public isTerrainPopulated(): boolean {
    return this.terrainPopulated;
  }

  public setTerrainPopulated(populated: boolean): void {
    if (this.terrainPopulated !== populated) {
      this.terrainPopulated = populated;
      this.markPersistenceDirty();
    }
  }

  public isCorrupt(): boolean {
    return this.corrupt;
  }

  public markCorrupt(): void {
    this.corrupt = true;
  }

  public getRevision(): number {
    return this.meshRevision;
  }

  public getBlockRevision(): number {
    return this.blockRevision;
  }

  public getMetadataRevision(): number {
    return this.metadataRevision;
  }

  public getLightRevision(): number {
    return this.lightRevision;
  }

  public getWeatherRevision(): number {
    return this.weatherRevision;
  }

  public getScheduledTicks(): ScheduledTickQueue {
    return this.scheduledTicks;
  }

  /** Pending ticks must be re-snapshotted with current remaining delays before streaming unload. */
  public requireScheduledTickUnloadSnapshot(): void {
    if (this.scheduledTicks.size > 0 && !this.isPersistenceDirty()) this.markPersistenceDirty();
  }

  private markBlockDataChanged(): void {
    this.heightmap = undefined;
    this.precipitationHeightmap = undefined;
    this.blockRevision += 1;
    this.weatherRevision += 1;
    this.markPersistenceDirty();
    this.markDirty();
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

  public getSkylight(localX: number, localY: number, localZ: number): number {
    if (!this.isInBounds(localX, localY, localZ)) {
      return 0;
    }
    return this.light[this.index(localX, localY, localZ)]! & 0x0F;
  }

  public setSkylight(localX: number, localY: number, localZ: number, value: number): void {
    if (!this.isInBounds(localX, localY, localZ)) {
      return;
    }
    const idx = this.index(localX, localY, localZ);
    if ((this.light[idx]! & 0x0F) === (value & 0x0F)) return;
    this.light[idx] = (this.light[idx]! & 0xF0) | (value & 0x0F);
    this.lightRevision += 1;
    this.markPersistenceDirty();
    this.markDirty();
  }

  public getBlocklight(localX: number, localY: number, localZ: number): number {
    if (!this.isInBounds(localX, localY, localZ)) {
      return 0;
    }
    return (this.light[this.index(localX, localY, localZ)]! >> 4) & 0x0F;
  }

  public setBlocklight(localX: number, localY: number, localZ: number, value: number): void {
    if (!this.isInBounds(localX, localY, localZ)) {
      return;
    }
    const idx = this.index(localX, localY, localZ);
    if (((this.light[idx]! >> 4) & 0x0F) === (value & 0x0F)) return;
    this.light[idx] = (this.light[idx]! & 0x0F) | ((value & 0x0F) << 4);
    this.lightRevision += 1;
    this.markPersistenceDirty();
    this.markDirty();
  }

  public getBlockMetadata(localX: number, localY: number, localZ: number): number {
    if (!this.isInBounds(localX, localY, localZ)) {
      return 0;
    }
    return this.metadata[this.index(localX, localY, localZ)]!;
  }

  public setBlockMetadata(
    localX: number,
    localY: number,
    localZ: number,
    value: number,
    options: { readonly affectsMesh?: boolean; readonly affectsWeather?: boolean; readonly affectsLight?: boolean } = {},
  ): boolean {
    if (!this.isInBounds(localX, localY, localZ)) {
      throw new RangeError(`Local block coordinates out of bounds: (${localX}, ${localY}, ${localZ})`);
    }
    if (value < 0 || value > 255) {
      throw new RangeError(`Block metadata ${value} does not fit in Uint8 storage (0–255).`);
    }
    const idx = this.index(localX, localY, localZ);
    if (this.metadata[idx] === value) {
      return false;
    }
    this.metadata[idx] = value;
    this.metadataRevision += 1;
    this.markPersistenceDirty();
    if (options.affectsWeather === true) {
      this.precipitationHeightmap = undefined;
      this.weatherRevision += 1;
    }
    if (options.affectsLight === true) {
      this.lightRevision += 1;
    }
    if (options.affectsMesh ?? true) {
      this.markDirty();
    }
    return true;
  }

  public updateBlockMetadata(
    localX: number,
    localY: number,
    localZ: number,
    updater: (metadata: number) => number,
    options: { readonly affectsMesh?: boolean; readonly affectsWeather?: boolean; readonly affectsLight?: boolean } = {},
  ): boolean {
    return this.setBlockMetadata(localX, localY, localZ, updater(this.getBlockMetadata(localX, localY, localZ)), options);
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
    this.markBlockDataChanged();
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
      this.markBlockDataChanged();
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
      this.markBlockDataChanged();
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
    this.markBlockDataChanged();
  }

  public copyBlocks(): Uint8Array {
    return new Uint8Array(this.blocks);
  }

  public copyMetadata(): Uint8Array {
    return new Uint8Array(this.metadata);
  }

  public copyLight(): Uint8Array {
    return new Uint8Array(this.light);
  }

  public copyHeightmap(): Int16Array | undefined {
    if (this.heightmap === undefined) return undefined;
    return new Int16Array(this.heightmap);
  }

  public loadGeneratedMetadata(data: Uint8Array): void {
    if (data.length !== CHUNK_VOLUME) {
      throw new RangeError(`Metadata array length ${data.length} does not match chunk volume ${CHUNK_VOLUME}.`);
    }
    this.metadata.set(data);
    this.metadataRevision += 1;
    this.markPersistenceDirty();
    this.markDirty();
  }

  public loadLightData(data: Uint8Array): void {
    if (data.length !== CHUNK_VOLUME) {
      throw new RangeError(`Light array length ${data.length} does not match chunk volume ${CHUNK_VOLUME}.`);
    }
    this.light.set(data);
    this.markPersistenceDirty();
    this.markDirty();
  }

  public loadHeightmap(data: Int16Array): void {
    if (data.length !== CHUNK_SIZE_X * CHUNK_SIZE_Z) {
      throw new RangeError(`Heightmap array length ${data.length} does not match ${CHUNK_SIZE_X * CHUNK_SIZE_Z}.`);
    }
    this.heightmap = new Int16Array(data);
    this.markPersistenceDirty();
  }

  /**
   * Returns the cached column height for (localX, localZ): one past the
   * topmost "opaque" block in that column (see NON_OPAQUE_FOR_HEIGHTMAP),
   * or 0 if the column is entirely non-opaque. Computes and caches the
   * full heightmap on first access after generation/mutation; matches
   * real Beta's `world.d(x,z)` semantics exactly, but is always derived
   * solely from this chunk's own current block data (see the
   * `heightmap` field's doc comment for why that matters).
   */
  public getHeight(localX: number, localZ: number): number {
    if (!this.isInBounds(localX, 0, localZ)) {
      throw new RangeError(`Local X/Z out of bounds: (${localX}, ${localZ})`);
    }

    if (this.heightmap === undefined) {
      this.recomputeHeightmap();
    }

    return this.heightmap![localZ * CHUNK_SIZE_X + localX]!;
  }

  /**
   * Beta precipitation-height lookup for rain/snow/lightning/splash
   * placement: one past the highest weather-blocking block. The caller
   * provides the block predicate so Chunk storage stays independent of
   * BlockRegistry while still caching the expensive vertical scan.
   */
  public getPrecipitationHeight(
    localX: number,
    localZ: number,
    blocksWeather: (blockId: BlockId) => boolean,
  ): number {
    if (!this.isInBounds(localX, 0, localZ)) {
      throw new RangeError(`Local X/Z out of bounds: (${localX}, ${localZ})`);
    }

    if (this.precipitationHeightmap === undefined) {
      this.recomputePrecipitationHeightmap(blocksWeather);
    }

    return this.precipitationHeightmap![localZ * CHUNK_SIZE_X + localX]!;
  }

  public recomputePrecipitationHeightmap(blocksWeather: (blockId: BlockId) => boolean): void {
    const map = new Int16Array(CHUNK_SIZE_X * CHUNK_SIZE_Z);

    for (let z = 0; z < CHUNK_SIZE_Z; z++) {
      for (let x = 0; x < CHUNK_SIZE_X; x++) {
        let y = CHUNK_SIZE_Y - 1;

        while (y > 0 && !blocksWeather(this.blocks[this.index(x, y, z)]!)) {
          y--;
        }

        map[z * CHUNK_SIZE_X + x] = y > 0 ? y + 1 : -1;
      }
    }

    this.precipitationHeightmap = map;
  }

  /**
   * Forces an immediate heightmap recomputation from the current block
   * data. Tree decoration (Stage 12C) calls this explicitly after
   * placing a tree (trunk/leaves change the column's top block), so a
   * second tree generated later in the same chunk sees an up-to-date
   * height, matching Beta's own live-updating heightmap during
   * decoration — still entirely self-contained to this chunk's own data.
   */
  public recomputeHeightmap(): void {
    const map = new Int16Array(CHUNK_SIZE_X * CHUNK_SIZE_Z);

    for (let z = 0; z < CHUNK_SIZE_Z; z++) {
      for (let x = 0; x < CHUNK_SIZE_X; x++) {
        let y = CHUNK_SIZE_Y - 1;

        while (y >= 0 && NON_OPAQUE_FOR_HEIGHTMAP.has(this.blocks[this.index(x, y, z)]!)) {
          y--;
        }

        map[z * CHUNK_SIZE_X + x] = y + 1;
      }
    }

    this.heightmap = map;
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
