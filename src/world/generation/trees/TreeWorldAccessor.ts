import type { BlockId } from '../../../blocks/BlockId';
import { BlockIds } from '../../../blocks/BlockId';
import { CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z } from '../../chunkConstants';
import { BetaTerrainGenerator } from '../BetaTerrainGenerator';
import { SurfaceGenerator } from '../SurfaceGenerator';
import { BetaCaveGenerator } from '../caves/BetaCaveGenerator';
import { JavaRandom } from '../random/JavaRandom';

/**
 * World-space read/write surface tree generators are ported against —
 * intentionally NOT the same interface as Chunk (which is local-coordinate
 * and single-chunk), because real Beta's WorldGenTrees/WorldGenBigTree
 * operate on absolute world coordinates and can legitimately read/write
 * into neighbouring chunks (see BetaTreeDecorator's module doc comment
 * for how this project keeps that order-independent).
 */
export interface TreeWorldAccessor {
  getBlock(worldX: number, worldY: number, worldZ: number): BlockId;
  setBlock(worldX: number, worldY: number, worldZ: number, blockId: BlockId): void;
  /** One past the topmost "opaque" block in this column (matches Chunk.getHeight's semantics, in world space). */
  getHeight(worldX: number, worldZ: number): number;
}

/** Flat XZY index matching Chunk's own layout (x fastest, then z, then y). */
function localIndex(localX: number, localY: number, localZ: number): number {
  return localX + localZ * CHUNK_SIZE_X + localY * CHUNK_SIZE_X * CHUNK_SIZE_Z;
}

function floorDiv(value: number, divisor: number): number {
  return Math.floor(value / divisor);
}

/**
 * Blocks that do NOT count as "opaque" for heightmap/leaf-placement
 * purposes — mirrors Chunk's own NON_OPAQUE_FOR_HEIGHTMAP set exactly
 * (both ultimately trace back to real Beta's single `Block.a()`
 * light-opacity flag, reused by both the heightmap AND
 * WorldGenTrees/WorldGenBigTree's `Block.o[]` "can leaves overwrite
 * this?" check — genuinely the same underlying flag in real Beta, not a
 * coincidence).
 */
const NON_OPAQUE = new Set<BlockId>([0, BlockIds.Water, BlockIds.Lava]);

/** True if a block is not "opaque" (matches real Beta's Block.o[]==false / Block.a()==false). */
export function isNonOpaque(blockId: BlockId): boolean {
  return NON_OPAQUE.has(blockId);
}

/**
 * Lazily recomputes and caches per-chunk terrain (density + surface +
 * caves — everything BEFORE tree decoration) for any chunk a tree
 * generator's read/write reaches, backed by a Map scoped to one
 * BetaTreeDecorator.decorate() call (see that class's doc comment for
 * why this keeps cross-chunk trees both correct and order-independent).
 *
 * The chunk currently being decorated (the "target" chunk) is seeded
 * directly from its own already-computed, already-cave-carved block
 * array (passed in by the caller) rather than recomputed — recomputing
 * it would be redundant (and, since generation is a pure function of
 * (seed, chunkX, chunkZ), byte-identical anyway) but wasteful.
 *
 * Writes accumulate into this scratch cache only; the caller
 * (BetaTreeDecorator) is responsible for copying whichever cells land
 * back in the real target chunk's array into that array afterwards.
 */
export class ScratchTreeWorld implements TreeWorldAccessor {
  private readonly terrainGenerator: BetaTerrainGenerator;
  private readonly worldSeed: bigint;
  private readonly chunkBlocks = new Map<string, Uint8Array>();
  private readonly chunkHeightmaps = new Map<string, Int16Array>();
  private readonly enableCaves: boolean;

  public constructor(worldSeed: bigint, terrainGenerator: BetaTerrainGenerator, enableCaves: boolean) {
    this.worldSeed = worldSeed;
    this.terrainGenerator = terrainGenerator;
    this.enableCaves = enableCaves;
  }

  /**
   * Seeds the scratch cache for the chunk currently being decorated
   * directly from its real, already-generated block array — must be
   * called once before any tree generation for this target chunk.
   */
  public seedTargetChunk(chunkX: number, chunkZ: number, blocks: Uint8Array): void {
    this.chunkBlocks.set(this.chunkKey(chunkX, chunkZ), blocks);
  }

  /** Returns the (possibly tree-modified) scratch buffer for a chunk, if it was ever touched. */
  public getScratchBlocks(chunkX: number, chunkZ: number): Uint8Array | undefined {
    return this.chunkBlocks.get(this.chunkKey(chunkX, chunkZ));
  }

  public getBlock(worldX: number, worldY: number, worldZ: number): BlockId {
    if (worldY < 0 || worldY >= CHUNK_SIZE_Y) {
      return 0;
    }

    const chunkX = floorDiv(worldX, CHUNK_SIZE_X);
    const chunkZ = floorDiv(worldZ, CHUNK_SIZE_Z);
    const localX = worldX - chunkX * CHUNK_SIZE_X;
    const localZ = worldZ - chunkZ * CHUNK_SIZE_Z;

    const blocks = this.ensureChunk(chunkX, chunkZ);
    return blocks[localIndex(localX, worldY, localZ)]!;
  }

  public setBlock(worldX: number, worldY: number, worldZ: number, blockId: BlockId): void {
    if (worldY < 0 || worldY >= CHUNK_SIZE_Y) {
      return;
    }

    const chunkX = floorDiv(worldX, CHUNK_SIZE_X);
    const chunkZ = floorDiv(worldZ, CHUNK_SIZE_Z);
    const localX = worldX - chunkX * CHUNK_SIZE_X;
    const localZ = worldZ - chunkZ * CHUNK_SIZE_Z;

    const blocks = this.ensureChunk(chunkX, chunkZ);
    blocks[localIndex(localX, worldY, localZ)] = blockId;

    // Invalidate that chunk's cached heightmap; recomputed lazily on
    // next getHeight() call for that chunk.
    this.chunkHeightmaps.delete(this.chunkKey(chunkX, chunkZ));
  }

  public getHeight(worldX: number, worldZ: number): number {
    const chunkX = floorDiv(worldX, CHUNK_SIZE_X);
    const chunkZ = floorDiv(worldZ, CHUNK_SIZE_Z);
    const localX = worldX - chunkX * CHUNK_SIZE_X;
    const localZ = worldZ - chunkZ * CHUNK_SIZE_Z;

    const key = this.chunkKey(chunkX, chunkZ);
    let heightmap = this.chunkHeightmaps.get(key);

    if (heightmap === undefined) {
      heightmap = this.computeHeightmap(this.ensureChunk(chunkX, chunkZ));
      this.chunkHeightmaps.set(key, heightmap);
    }

    return heightmap[localZ * CHUNK_SIZE_X + localX]!;
  }

  private ensureChunk(chunkX: number, chunkZ: number): Uint8Array {
    const key = this.chunkKey(chunkX, chunkZ);
    let blocks = this.chunkBlocks.get(key);

    if (blocks === undefined) {
      // Recompute this neighbour's terrain (density + surface + caves)
      // read-only, purely to answer this access — never mutates any
      // real Chunk, and is deterministic/order-independent since it's a
      // pure function of (worldSeed, chunkX, chunkZ), matching how
      // BetaCaveGenerator/BetaTerrainGenerator are already verified to
      // behave regardless of when/whether that neighbour chunk has
      // "really" been generated by the streaming system yet.
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

  private chunkKey(chunkX: number, chunkZ: number): string {
    return `${chunkX},${chunkZ}`;
  }
}
