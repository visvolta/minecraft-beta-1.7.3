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

/** Scratch THREE.Color used to convert sRGB to linear. */
const tintConversionColor = new THREE.Color();

/**
 * Maps a face's local-space corner to (u, v) in the source texture's own
 * 0–1 space, before atlas placement.
 */
function localCornerToTextureUv(face: FaceDef, corner: Corner): readonly [number, number] {
  const [x, y, z] = corner;

  if (face.dx !== 0) {
    const u = face.dx > 0 ? 1 - z : z;
    return [u, 1 - y];
  }

  if (face.dz !== 0) {
    const u = face.dz > 0 ? x : 1 - x;
    return [u, 1 - y];
  }

  const v = face.dy > 0 ? z : 1 - z;
  return [x, v];
}

/**
 * Translates a light level (0-15) into a brightness multiplier (0.0 - 1.0)
 * using the authentic non-linear exponential decay curve from Beta 1.7.3.
 */
function getLightBrightness(lightLevel: number): number {
  return Math.pow(0.8, 15 - lightLevel) * 0.95 + 0.05;
}

/**
 * Applies basic Beta-style directional shading to give a 3D blocky feel.
 */
function getDirectionalShading(face: FaceDef): number {
  if (face.dy > 0) return 1.0; // Top face (+Y)
  if (face.dy < 0) return 0.5; // Bottom face (-Y)
  if (face.dx !== 0) return 0.6; // East/West faces (X)
  return 0.8; // North/South faces (Z)
}

/**
 * Accumulates vertex attributes and indices for one mesh build,
 * applying brightness and basic directional shading.
 */
class MeshBuffers {
  public readonly positions: number[] = [];
  public readonly normals: number[] = [];
  public readonly uvs: number[] = [];
  public readonly colors: number[] = [];
  public readonly indices: number[] = [];

  public pushFace(
    face: FaceDef,
    x: number,
    y: number,
    z: number,
    uvRect: { u0: number; v0: number; u1: number; v1: number } | undefined,
    tint: readonly [number, number, number],
    lightLevel: number,
  ): void {
    const brightness = getLightBrightness(lightLevel);
    const directional = getDirectionalShading(face);
    const multiplier = brightness * directional;

    tintConversionColor.setRGB(
      tint[0] * multiplier,
      tint[1] * multiplier,
      tint[2] * multiplier,
      THREE.SRGBColorSpace,
    );

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

  /**
   * Pushes a crossed flat plane model (two intersecting vertical diagonal planes).
   */
  public pushCross(
    x: number,
    y: number,
    z: number,
    uvRect: { u0: number; v0: number; u1: number; v1: number } | undefined,
    tint: readonly [number, number, number],
    lightLevel: number,
  ): void {
    const brightness = getLightBrightness(lightLevel);

    tintConversionColor.setRGB(
      tint[0] * brightness,
      tint[1] * brightness,
      tint[2] * brightness,
      THREE.SRGBColorSpace,
    );

    const u0 = uvRect ? uvRect.u0 : 0;
    const v0 = uvRect ? uvRect.v0 : 0;
    const u1 = uvRect ? uvRect.u1 : 0;
    const v1 = uvRect ? uvRect.v1 : 0;

    const r = tintConversionColor.r;
    const g = tintConversionColor.g;
    const b = tintConversionColor.b;

    const nx = 0;
    const ny = 1;
    const nz = 0;

    // Plane 1: Diagonal from (0,0,0) to (1,1,1)
    let offset = this.positions.length / 3;
    this.positions.push(
      x, y, z,
      x + 1, y, z + 1,
      x + 1, y + 1, z + 1,
      x, y + 1, z
    );
    for (let i = 0; i < 4; i++) {
      this.normals.push(nx, ny, nz);
      this.colors.push(r, g, b);
    }
    this.uvs.push(
      u0, v1,
      u1, v1,
      u1, v0,
      u0, v0
    );
    this.indices.push(
      offset, offset + 1, offset + 2,
      offset, offset + 2, offset + 3
    );

    // Plane 2: Diagonal from (0,0,1) to (1,1,0)
    offset = this.positions.length / 3;
    this.positions.push(
      x, y, z + 1,
      x + 1, y, z,
      x + 1, y + 1, z,
      x, y + 1, z + 1
    );
    for (let i = 0; i < 4; i++) {
      this.normals.push(nx, ny, nz);
      this.colors.push(r, g, b);
    }
    this.uvs.push(
      u0, v1,
      u1, v1,
      u1, v0,
      u0, v0
    );
    this.indices.push(
      offset, offset + 1, offset + 2,
      offset, offset + 2, offset + 3
    );
  }

  /**
   * Pushes one face of a Cactus model (which is horizontally inset by 1/16).
   */
  public pushCactusFace(
    faceIndex: number, // 0: +X, 1: -X, 2: +Y, 3: -Y, 4: +Z, 5: -Z
    x: number,
    y: number,
    z: number,
    uvRect: { u0: number; v0: number; u1: number; v1: number } | undefined,
    tint: readonly [number, number, number],
    lightLevel: number,
  ): void {
    const brightness = getLightBrightness(lightLevel);
    const directional = getDirectionalShading(FACES[faceIndex]!);
    const multiplier = brightness * directional;

    tintConversionColor.setRGB(
      tint[0] * multiplier,
      tint[1] * multiplier,
      tint[2] * multiplier,
      THREE.SRGBColorSpace,
    );

    const u0 = uvRect ? uvRect.u0 : 0;
    const v0 = uvRect ? uvRect.v0 : 0;
    const u1 = uvRect ? uvRect.u1 : 0;
    const v1 = uvRect ? uvRect.v1 : 0;

    const r = tintConversionColor.r;
    const g = tintConversionColor.g;
    const b = tintConversionColor.b;

    const vertexOffset = this.positions.length / 3;

    const inset = 0.0625; // 1/16
    const oinset = 1 - inset;

    let px: number[] = [];
    let py: number[] = [];
    let pz: number[] = [];
    let nx = 0, ny = 0, nz = 0;
    let faceUvs: number[] = [];

    switch (faceIndex) {
      case 0: // +X (East)
        px = [x + oinset, x + oinset, x + oinset, x + oinset];
        py = [y, y + 1, y + 1, y];
        pz = [z + inset, z + inset, z + oinset, z + oinset];
        nx = 1; ny = 0; nz = 0;
        faceUvs = [
          u0 + (u1 - u0) * inset, v1,
          u0 + (u1 - u0) * inset, v0,
          u0 + (u1 - u0) * oinset, v0,
          u0 + (u1 - u0) * oinset, v1
        ];
        break;
      case 1: // -X (West)
        px = [x + inset, x + inset, x + inset, x + inset];
        py = [y, y + 1, y + 1, y];
        pz = [z + oinset, z + oinset, z + inset, z + inset];
        nx = -1; ny = 0; nz = 0;
        faceUvs = [
          u0 + (u1 - u0) * oinset, v1,
          u0 + (u1 - u0) * oinset, v0,
          u0 + (u1 - u0) * inset, v0,
          u0 + (u1 - u0) * inset, v1
        ];
        break;
      case 2: // +Y (Up)
        px = [x + inset, x + oinset, x + oinset, x + inset];
        py = [y + 1, y + 1, y + 1, y + 1];
        pz = [z + oinset, z + oinset, z + inset, z + inset];
        nx = 0; ny = 1; nz = 0;
        faceUvs = [
          u0 + (u1 - u0) * inset, v0 + (v1 - v0) * oinset,
          u0 + (u1 - u0) * oinset, v0 + (v1 - v0) * oinset,
          u0 + (u1 - u0) * oinset, v0 + (v1 - v0) * inset,
          u0 + (u1 - u0) * inset, v0 + (v1 - v0) * inset
        ];
        break;
      case 3: // -Y (Down)
        px = [x + inset, x + oinset, x + oinset, x + inset];
        py = [y, y, y, y];
        pz = [z + inset, z + inset, z + oinset, z + oinset];
        nx = 0; ny = -1; nz = 0;
        faceUvs = [
          u0 + (u1 - u0) * inset, v0 + (v1 - v0) * inset,
          u0 + (u1 - u0) * oinset, v0 + (v1 - v0) * inset,
          u0 + (u1 - u0) * oinset, v0 + (v1 - v0) * oinset,
          u0 + (u1 - u0) * inset, v0 + (v1 - v0) * oinset
        ];
        break;
      case 4: // +Z (South)
        px = [x + inset, x + oinset, x + oinset, x + inset];
        py = [y, y, y + 1, y + 1];
        pz = [z + oinset, z + oinset, z + oinset, z + oinset];
        nx = 0; ny = 0; nz = 1;
        faceUvs = [
          u0 + (u1 - u0) * inset, v1,
          u0 + (u1 - u0) * oinset, v1,
          u0 + (u1 - u0) * oinset, v0,
          u0 + (u1 - u0) * inset, v0
        ];
        break;
      case 5: // -Z (North)
        px = [x + oinset, x + inset, x + inset, x + oinset];
        py = [y + 1, y + 1, y, y];
        pz = [z + inset, z + inset, z + inset, z + inset];
        nx = 0; ny = 0; nz = -1;
        faceUvs = [
          u0 + (u1 - u0) * oinset, v0,
          u0 + (u1 - u0) * inset, v0,
          u0 + (u1 - u0) * inset, v1,
          u0 + (u1 - u0) * oinset, v1
        ];
        break;
    }

    for (let i = 0; i < 4; i++) {
      this.positions.push(px[i]!, py[i]!, pz[i]!);
      this.normals.push(nx, ny, nz);
      this.colors.push(r, g, b);
      this.uvs.push(faceUvs[i * 2]!, faceUvs[i * 2 + 1]!);
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
 * Builds block geometry for one chunk, reading skylight and blocklight values.
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
   * Helper to sample maximum light (max(skylight, blocklight)) at absolute coordinates,
   * taking chunk boundaries into account.
   */
  private getLightAt(chunk: Chunk, lx: number, ly: number, lz: number): number {
    if (ly < 0) return 0;
    if (ly >= CHUNK_SIZE_Y) return 15; // Open sky receives full light

    if (chunk.isInBounds(lx, ly, lz)) {
      const sky = chunk.getSkylight(lx, ly, lz);
      const block = chunk.getBlocklight(lx, ly, lz);
      return Math.max(sky, block);
    }

    let chunkX = chunk.chunkX;
    let chunkZ = chunk.chunkZ;
    let x = lx;
    let z = lz;

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
      return ly >= 64 ? 15 : 0; // Default fallback depending on height when neighbor is unloaded
    }

    const sky = neighbour.getSkylight(x, ly, z);
    const block = neighbour.getBlocklight(x, ly, z);
    return Math.max(sky, block);
  }

  /**
   * Builds opaque terrain geometry: every block with renderType === 'opaque'.
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

            // Sample light level of adjacent block face
            const light = this.getLightAt(chunk, x + face.dx, y + face.dy, z + face.dz);

            buffers.pushFace(face, x, y, z, uvRect, tint, light);
          }
        }
      }
    }

    return buffers.toGeometry();
  }

  /**
   * Builds cutout geometry:
   *  - Leaves: hidesLeafFace(neighbour)
   *  - Spawner: hidesCutoutFace(neighbour)
   *  - Cross plant: no culling, pushCross called once
   *  - Cactus: hidesCactusFace(faceIndex, neighbour)
   */
  public buildCutouts(chunk: Chunk): THREE.BufferGeometry {
    const buffers = new MeshBuffers();

    for (let y = 0; y < CHUNK_SIZE_Y; y++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          const blockId = chunk.getBlock(x, y, z);

          if (blockId === AIR_BLOCK_ID) {
            continue;
          }

          const definition = this.blockRegistry.getById(blockId);
          if (definition === undefined || definition.renderType === undefined) {
            continue;
          }

          const renderType = definition.renderType;

          if (renderType === 'leaves') {
            for (const face of FACES) {
              const neighbourId = this.getNeighbourBlock(
                chunk,
                x + face.dx,
                y + face.dy,
                z + face.dz,
              );

              if (this.hidesLeafFace(neighbourId)) {
                continue;
              }

              const textureName = resolveBlockTexture(definition, face.slot);
              const uvRect =
                textureName !== undefined ? this.atlas.getUvRect(textureName) : undefined;
              const tint = resolveBlockTint(definition, face.slot);

              const light = this.getLightAt(chunk, x + face.dx, y + face.dy, z + face.dz);

              buffers.pushFace(face, x, y, z, uvRect, tint, light);
            }
          } else if (renderType === 'cutout') {
            for (const face of FACES) {
              const neighbourId = this.getNeighbourBlock(
                chunk,
                x + face.dx,
                y + face.dy,
                z + face.dz,
              );

              if (this.hidesCutoutFace(neighbourId)) {
                continue;
              }

              const textureName = resolveBlockTexture(definition, face.slot);
              const uvRect =
                textureName !== undefined ? this.atlas.getUvRect(textureName) : undefined;
              const tint = resolveBlockTint(definition, face.slot);

              const light = this.getLightAt(chunk, x + face.dx, y + face.dy, z + face.dz);

              buffers.pushFace(face, x, y, z, uvRect, tint, light);
            }
          } else if (renderType === 'cross') {
            const textureName = resolveBlockTexture(definition, 'side');
            const uvRect =
              textureName !== undefined ? this.atlas.getUvRect(textureName) : undefined;
            const tint = resolveBlockTint(definition, 'side');

            // Cross plant uses its own block's light level space
            const light = this.getLightAt(chunk, x, y, z);

            buffers.pushCross(x, y, z, uvRect, tint, light);
          } else if (renderType === 'cactus') {
            for (let i = 0; i < 6; i++) {
              const face = FACES[i]!;
              const neighbourId = this.getNeighbourBlock(
                chunk,
                x + face.dx,
                y + face.dy,
                z + face.dz,
              );

              if (this.hidesCactusFace(i, neighbourId)) {
                continue;
              }

              const slot = i === 2 ? 'top' : (i === 3 ? 'bottom' : 'side');
              const textureName = resolveBlockTexture(definition, slot);
              const uvRect =
                textureName !== undefined ? this.atlas.getUvRect(textureName) : undefined;
              const tint = resolveBlockTint(definition, slot);

              const light = this.getLightAt(chunk, x + face.dx, y + face.dy, z + face.dz);

              buffers.pushCactusFace(i, x, y, z, uvRect, tint, light);
            }
          }
        }
      }
    }

    return buffers.toGeometry();
  }

  /**
   * Builds still-fluid geometry for Water and Lava Still.
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

            // Fluids use their own block's light level space
            const light = this.getLightAt(chunk, x, y, z);

            buffers.pushFace(face, x, y, z, uvRect, tint, light);
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
   * Only solid, non-transparent, non-cutout, non-leaves blocks hide opaque faces.
   */
  private hidesOpaqueFace(neighbourId: BlockId): boolean {
    const neighbourDef = this.blockRegistry.getById(neighbourId);
    if (neighbourDef === undefined) {
      return false;
    }
    return neighbourDef.solid && !neighbourDef.transparent && neighbourDef.renderType === 'opaque';
  }

  /**
   * Cutout blocks (like Spawners) are hidden only by solid, non-transparent, non-leaves opaque blocks.
   */
  private hidesCutoutFace(neighbourId: BlockId): boolean {
    const neighbourDef = this.blockRegistry.getById(neighbourId);
    if (neighbourDef === undefined) {
      return false;
    }
    return neighbourDef.solid && !neighbourDef.transparent && neighbourDef.renderType === 'opaque';
  }

  /**
   * Leaves faces are hidden if the neighbour is a leaf block OR an opaque solid block.
   */
  private hidesLeafFace(neighbourId: BlockId): boolean {
    const neighbourDef = this.blockRegistry.getById(neighbourId);
    if (neighbourDef === undefined) {
      return false;
    }
    return (neighbourDef.solid && !neighbourDef.transparent && neighbourDef.renderType === 'opaque') || neighbourDef.renderType === 'leaves';
  }

  /**
   * Cactus top/bottom faces are culled if the neighbour is solid and non-transparent.
   * Cactus side faces are never culled because they are inset by 1/16.
   */
  private hidesCactusFace(faceIndex: number, neighbourId: BlockId): boolean {
    if (faceIndex !== 2 && faceIndex !== 3) {
      return false;
    }
    const neighbourDef = this.blockRegistry.getById(neighbourId);
    if (neighbourDef === undefined) {
      return false;
    }
    return neighbourDef.solid && !neighbourDef.transparent;
  }

  /** True if a block ID is one of the still-fluid blocks meshed by buildFluids(). */
  private isFluid(blockId: BlockId): boolean {
    return blockId === BlockIds.Water || blockId === BlockIds.Lava || blockId === BlockIds.LavaStill;
  }

  /**
   * True if a fluid face should be culled against this neighbour.
   */
  private hidesFluidFace(fluidBlockId: BlockId, neighbourId: BlockId): boolean {
    if (neighbourId === fluidBlockId) {
      return true;
    }

    const neighbourDef = this.blockRegistry.getById(neighbourId);
    if (neighbourDef === undefined) {
      return false;
    }

    return neighbourDef.solid && !neighbourDef.transparent;
  }

  /** True for blocks meshed in the opaque pass: solid, non-transparent, and of renderType 'opaque'. */
  private isOpaqueMeshBlock(blockId: BlockId): boolean {
    const definition = this.blockRegistry.getById(blockId);
    if (definition === undefined) {
      return false;
    }
    return definition.renderType === 'opaque';
  }
}
