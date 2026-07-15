import * as THREE from 'three';
import type { BlockId } from '../blocks/BlockId';
import { BlockIds } from '../blocks/BlockId';
import type { BlockFace } from '../blocks/BlockFace';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import { resolveBlockTexture } from '../blocks/resolveBlockTexture';
import { resolveBlockTint } from '../blocks/resolveBlockTint';
import type { TextureAtlas } from '../assets/TextureAtlas';
import type { Chunk } from '../world/Chunk';
import type { ChunkManager } from '../world/ChunkManager';
import {
  AIR_BLOCK_ID,
  CHUNK_SIZE_X,
  CHUNK_SIZE_Y,
  CHUNK_SIZE_Z,
} from '../world/chunkConstants';

/** Local-space (0–1) corner position for one face vertex. */
type Corner = readonly [number, number, number];

/** Face: axis normal + four local corners (CCW when viewed from outside). */
interface FaceDef {
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly dx: number;
  readonly dy: number;
  readonly dz: number;
  /** Which texture slot this face resolves against (all/top/bottom/side). */
  readonly slot: BlockFace;
  readonly corners: readonly [Corner, Corner, Corner, Corner];
}

const FACES: readonly FaceDef[] = [
  // +X (east)
  {
    nx: 1,
    ny: 0,
    nz: 0,
    dx: 1,
    dy: 0,
    dz: 0,
    slot: 'side',
    corners: [
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
      [1, 0, 1],
    ],
  },
  // -X (west)
  {
    nx: -1,
    ny: 0,
    nz: 0,
    dx: -1,
    dy: 0,
    dz: 0,
    slot: 'side',
    corners: [
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
      [0, 0, 0],
    ],
  },
  // +Y (up)
  {
    nx: 0,
    ny: 1,
    nz: 0,
    dx: 0,
    dy: 1,
    dz: 0,
    slot: 'top',
    corners: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ],
  },
  // -Y (down)
  {
    nx: 0,
    ny: -1,
    nz: 0,
    dx: 0,
    dy: -1,
    dz: 0,
    slot: 'bottom',
    corners: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
  },
  // +Z (south)
  {
    nx: 0,
    ny: 0,
    nz: 1,
    dx: 0,
    dy: 0,
    dz: 1,
    slot: 'side',
    corners: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
  },
  // -Z (north)
  {
    nx: 0,
    ny: 0,
    nz: -1,
    dx: 0,
    dy: 0,
    dz: -1,
    slot: 'side',
    corners: [
      [0, 1, 0],
      [1, 1, 0],
      [1, 0, 0],
      [0, 0, 0],
    ],
  },
];

/**
 * Scratch THREE.Color used to convert sRGB-authored block tints (see
 * BlockDefinition.tints) into the renderer's linear working colour space
 * before they are written into the vertex colour buffer. THREE's
 * vertexColors path multiplies buffer values directly in linear space, so
 * feeding it raw sRGB values would render visibly wrong (too dark/muted).
 * Reused per-call to avoid per-face allocation.
 */
const tintConversionColor = new THREE.Color();

/**
 * Maps a face's local-space corner to (u, v) in the source texture's own
 * 0–1 space, before atlas placement. V follows Beta's "top of block reads
 * as top of texture" convention: v = 0 at the top of the block (y = 1).
 */
function localCornerToTextureUv(face: FaceDef, corner: Corner): readonly [number, number] {
  const [x, y, z] = corner;

  if (face.dx !== 0) {
    // East/West side faces: horizontal axis follows Z, vertical follows Y.
    // Screen-right (increasing u) points toward -Z when viewing the +X
    // face from outside, and toward +Z when viewing the -X face from
    // outside (opposite of a naive same-sign assumption) — verified by
    // rendering a chirally-asymmetric marker texture on each face.
    const u = face.dx > 0 ? 1 - z : z;
    return [u, 1 - y];
  }

  if (face.dz !== 0) {
    // North/South side faces: horizontal axis follows X, vertical follows Y.
    const u = face.dz > 0 ? x : 1 - x;
    return [u, 1 - y];
  }

  // Top/bottom faces: both remaining axes are horizontal.
  const v = face.dy > 0 ? z : 1 - z;
  return [x, v];
}

/**
 * Accumulates vertex attributes and indices for one mesh build (opaque or
 * water), then produces the finished BufferGeometry. Kept as a tiny local
 * helper (not exported) so build()/buildWater() share the exact same
 * per-face vertex-emission logic without duplicating it.
 */
class MeshBuffers {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly uvs: number[] = [];
  private readonly colors: number[] = [];
  private readonly indices: number[] = [];

  public pushFace(
    face: FaceDef,
    x: number,
    y: number,
    z: number,
    uvRect: { u0: number; v0: number; u1: number; v1: number } | undefined,
    tint: readonly [number, number, number],
  ): void {
    tintConversionColor.setRGB(tint[0], tint[1], tint[2], THREE.SRGBColorSpace);

    const vertexOffset = this.positions.length / 3;

    for (const corner of face.corners) {
      const [cx, cy, cz] = corner;
      this.positions.push(x + cx, y + cy, z + cz);
      this.normals.push(face.nx, face.ny, face.nz);
      this.colors.push(tintConversionColor.r, tintConversionColor.g, tintConversionColor.b);

      if (uvRect !== undefined) {
        const [localU, localV] = localCornerToTextureUv(face, corner);
        this.uvs.push(
          uvRect.u0 + localU * (uvRect.u1 - uvRect.u0),
          uvRect.v0 + localV * (uvRect.v1 - uvRect.v0),
        );
      } else {
        // No texture resolved for this face (should not happen for
        // registered blocks with complete definitions); avoid a
        // misaligned attribute array.
        this.uvs.push(0, 0);
      }
    }

    this.indices.push(
      vertexOffset,
      vertexOffset + 1,
      vertexOffset + 2,
      vertexOffset,
      vertexOffset + 2,
      vertexOffset + 3,
    );
  }

  public toGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setIndex(this.indices);
    return geometry;
  }
}

/**
 * Builds culled face geometry for one chunk, in three separate passes:
 * opaque terrain (build), still fluids (buildFluids), and alpha-tested
 * cutout blocks — Leaves/SpruceLeaves, Stage 12C (buildCutouts). Missing
 * neighbour chunks are treated as Air in all passes. Emits UVs (via the
 * shared atlas) and per-vertex tint colours instead of flat placeholder
 * colours.
 */
export class ChunkMesher {
  private readonly chunkManager: ChunkManager;
  private readonly blockRegistry: BlockRegistry;
  private readonly atlas: TextureAtlas;

  public constructor(
    chunkManager: ChunkManager,
    blockRegistry: BlockRegistry,
    atlas: TextureAtlas,
  ) {
    this.chunkManager = chunkManager;
    this.blockRegistry = blockRegistry;
    this.atlas = atlas;
  }

  /**
   * Builds opaque terrain geometry: every solid, non-transparent,
   * non-cutout block (cutout blocks like Leaves are meshed separately by
   * buildCutouts, even though they're also "solid" for culling purposes).
   */
  public build(chunk: Chunk): THREE.BufferGeometry {
    const buffers = new MeshBuffers();

    for (let y = 0; y < CHUNK_SIZE_Y; y++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          const blockId = chunk.getBlock(x, y, z);

          if (blockId === AIR_BLOCK_ID || !this.isOpaqueMeshBlock(blockId)) {
            continue;
          }

          const definition = this.blockRegistry.getById(blockId);
          if (definition === undefined) {
            continue;
          }

          for (const face of FACES) {
            const neighbourId = this.getNeighbourBlock(
              chunk,
              x + face.dx,
              y + face.dy,
              z + face.dz,
            );

            if (this.hidesOpaqueFace(neighbourId)) {
              continue;
            }

            const textureName = resolveBlockTexture(definition, face.slot);
            const uvRect =
              textureName !== undefined ? this.atlas.getUvRect(textureName) : undefined;
            const tint = resolveBlockTint(definition, face.slot);

            buffers.pushFace(face, x, y, z, uvRect, tint);
          }
        }
      }
    }

    return buffers.toGeometry();
  }

  /**
   * Builds alpha-tested cutout geometry (Stage 12C: Leaves and
   * SpruceLeaves). Cutout blocks are "solid" for face-culling purposes,
   * exactly like real Beta leaves — a face is only emitted when the
   * neighbour is NOT solid-for-culling (matching hidesOpaqueFace's own
   * rule, reused here via isCullingSolid so opaque and cutout blocks
   * consistently hide each other's shared faces in both directions).
   */
  public buildCutouts(chunk: Chunk): THREE.BufferGeometry {
    const buffers = new MeshBuffers();

    for (let y = 0; y < CHUNK_SIZE_Y; y++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          const blockId = chunk.getBlock(x, y, z);

          if (blockId === AIR_BLOCK_ID || !this.isCutoutBlock(blockId)) {
            continue;
          }

          const definition = this.blockRegistry.getById(blockId);
          if (definition === undefined) {
            continue;
          }

          for (const face of FACES) {
            const neighbourId = this.getNeighbourBlock(
              chunk,
              x + face.dx,
              y + face.dy,
              z + face.dz,
            );

            if (this.isCullingSolid(neighbourId)) {
              continue;
            }

            const textureName = resolveBlockTexture(definition, face.slot);
            const uvRect =
              textureName !== undefined ? this.atlas.getUvRect(textureName) : undefined;
            const tint = resolveBlockTint(definition, face.slot);

            buffers.pushFace(face, x, y, z, uvRect, tint);
          }
        }
      }
    }

    return buffers.toGeometry();
  }

  /**
   * Builds still-fluid geometry for one chunk (Water and, since Stage
   * 12B introduced cave-generated Lava, Lava too — both are static,
   * non-animated "still fluid" blocks with identical meshing rules, so
   * they share one pass rather than duplicating buildWater's logic per
   * fluid type). Only emits faces where a fluid block is actually
   * exposed:
   *  - Fluid -> Air: always emitted.
   *  - Fluid -> transparent non-matching block (including the other
   *    fluid type, e.g. Water next to Lava): emitted — they are visually
   *    distinct blocks, so the boundary face is meaningful geometry, not
   *    redundant internal geometry.
   *  - Fluid -> the SAME fluid type: never emitted (no internal faces
   *    between adjacent blocks of the same fluid, per Stage 12D scope,
   *    now applied per-fluid-type rather than only to Water).
   *  - Fluid -> solid opaque block: never emitted (already fully hidden).
   */
  public buildFluids(chunk: Chunk): THREE.BufferGeometry {
    const buffers = new MeshBuffers();

    for (let y = 0; y < CHUNK_SIZE_Y; y++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          const blockId = chunk.getBlock(x, y, z);

          if (!this.isFluid(blockId)) {
            continue;
          }

          const definition = this.blockRegistry.getById(blockId);
          if (definition === undefined) {
            continue;
          }

          for (const face of FACES) {
            const neighbourId = this.getNeighbourBlock(
              chunk,
              x + face.dx,
              y + face.dy,
              z + face.dz,
            );

            if (this.hidesFluidFace(blockId, neighbourId)) {
              continue;
            }

            const textureName = resolveBlockTexture(definition, face.slot);
            const uvRect =
              textureName !== undefined ? this.atlas.getUvRect(textureName) : undefined;
            const tint = resolveBlockTint(definition, face.slot);

            buffers.pushFace(face, x, y, z, uvRect, tint);
          }
        }
      }
    }

    return buffers.toGeometry();
  }

  private getNeighbourBlock(
    chunk: Chunk,
    localX: number,
    localY: number,
    localZ: number,
  ): BlockId {
    if (localY < 0 || localY >= CHUNK_SIZE_Y) {
      return AIR_BLOCK_ID;
    }

    if (chunk.isInBounds(localX, localY, localZ)) {
      return chunk.getBlock(localX, localY, localZ);
    }

    let chunkX = chunk.chunkX;
    let chunkZ = chunk.chunkZ;
    let x = localX;
    let z = localZ;

    if (x < 0) {
      chunkX -= 1;
      x += CHUNK_SIZE_X;
    } else if (x >= CHUNK_SIZE_X) {
      chunkX += 1;
      x -= CHUNK_SIZE_X;
    }

    if (z < 0) {
      chunkZ -= 1;
      z += CHUNK_SIZE_Z;
    } else if (z >= CHUNK_SIZE_Z) {
      chunkZ += 1;
      z -= CHUNK_SIZE_Z;
    }

    const neighbour = this.chunkManager.getChunk(chunkX, chunkZ);
    if (neighbour === undefined) {
      return AIR_BLOCK_ID;
    }

    return neighbour.getBlock(x, localY, z);
  }

  /**
   * True if an opaque-terrain face should be culled against this
   * neighbour. Cutout blocks (Leaves) count as culling-solid here too —
   * an opaque block face fully hidden behind a leaf block is genuinely
   * invisible and would be unnecessary geometry, matching real Beta.
   */
  private hidesOpaqueFace(blockId: BlockId): boolean {
    if (blockId === AIR_BLOCK_ID) {
      return false;
    }

    return this.isCullingSolid(blockId);
  }

  /** True if a block ID is one of the still-fluid blocks meshed by buildFluids(). */
  private isFluid(blockId: BlockId): boolean {
    return blockId === BlockIds.Water || blockId === BlockIds.Lava;
  }

  /**
   * True if a fluid face (for `fluidBlockId`, e.g. Water or Lava) should
   * be culled against this neighbour:
   *  - The SAME fluid type hides the face (no internal faces between
   *    adjacent blocks of one fluid, per Stage 12D scope, generalized in
   *    Stage 12B to apply per-fluid-type rather than only to Water).
   *  - A solid or cutout neighbour (e.g. the stone floor a lake sits on,
   *    or Stage 12C's leaves) also hides the face: it can never be seen,
   *    so emitting it would be unnecessary geometry, contrary to this
   *    stage's explicit "avoid unnecessary geometry" requirement.
   *  - Air, the OTHER fluid type, and any other transparent block always
   *    expose the face (they are visually distinct from `fluidBlockId`).
   */
  private hidesFluidFace(fluidBlockId: BlockId, neighbourId: BlockId): boolean {
    if (neighbourId === fluidBlockId) {
      return true;
    }

    return this.isCullingSolid(neighbourId);
  }

  /** True for blocks meshed in the opaque pass: solid, non-transparent, and NOT cutout. */
  private isOpaqueMeshBlock(blockId: BlockId): boolean {
    const definition = this.blockRegistry.getById(blockId);
    if (definition === undefined) {
      return false;
    }

    return definition.solid && !definition.transparent && !definition.cutout;
  }

  /** True for blocks meshed in the cutout pass (Stage 12C: Leaves, SpruceLeaves). */
  private isCutoutBlock(blockId: BlockId): boolean {
    const definition = this.blockRegistry.getById(blockId);
    return definition?.cutout === true;
  }

  /**
   * True if this block should hide a neighbouring face for culling
   * purposes — solid+opaque terrain blocks AND cutout blocks (leaves)
   * both count, matching real Beta (leaves are solid, opaque-for-culling
   * blocks; only their *rendering* uses binary alpha, not their
   * face-culling behaviour). This is the single shared "is this
   * something a face can hide behind" rule used by every mesh pass.
   */
  private isCullingSolid(blockId: BlockId): boolean {
    const definition = this.blockRegistry.getById(blockId);
    if (definition === undefined) {
      return false;
    }

    return definition.solid && !definition.transparent;
  }
}
