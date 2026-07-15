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

type Corner = readonly [number, number, number];
type Quad4 = readonly [number, number, number, number];

interface FaceDef {
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly dx: number;
  readonly dy: number;
  readonly dz: number;
  readonly slot: BlockFace;
  readonly corners: readonly [Corner, Corner, Corner, Corner];
}

interface LightSample {
  readonly sky: number;
  readonly block: number;
}

interface VertexSmoothLighting {
  readonly skyLevels: Quad4;
  readonly blockLevels: Quad4;
  readonly aoFactors: Quad4;
  readonly flipDiagonal: boolean;
}

const AO_LEVEL_TO_FACTOR = [0.4, 0.6, 0.8, 1.0] as const;
const DEFAULT_VALUES: Quad4 = [1, 1, 1, 1];
const CROSS_NORMAL_A = 1 / Math.sqrt(2);
const CROSS_NORMAL_B = -CROSS_NORMAL_A;

const FACES: readonly FaceDef[] = [
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

const tintConversionColor = new THREE.Color();

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

function getLightBrightness(lightLevel: number): number {
  const clamped = THREE.MathUtils.clamp(lightLevel, 0, 15);
  const darkness = 1 - clamped / 15;
  return ((1 - darkness) / (darkness * 3 + 1)) * 0.95 + 0.05;
}

function vertexAO(side1: boolean, side2: boolean, diagonal: boolean): number {
  if (side1 && side2) {
    return 0;
  }

  return 3 - Number(side1) - Number(side2) - Number(diagonal);
}

function getLinearTint(tint: readonly [number, number, number]): readonly [number, number, number] {
  tintConversionColor.setRGB(tint[0], tint[1], tint[2], THREE.SRGBColorSpace);
  return [tintConversionColor.r, tintConversionColor.g, tintConversionColor.b];
}

class MeshBuffers {
  public readonly positions: number[] = [];
  public readonly normals: number[] = [];
  public readonly uvs: number[] = [];
  public readonly normalColors: number[] = [];
  public readonly debugColors: number[] = [];
  public readonly aoColors: number[] = [];
  public readonly tintColors: number[] = [];
  public readonly skyLightLevels: number[] = [];
  public readonly blockLightLevels: number[] = [];
  public readonly aoFactorScalars: number[] = [];
  public readonly indices: number[] = [];

  public pushFace(
    face: FaceDef,
    x: number,
    y: number,
    z: number,
    uvRect: { u0: number; v0: number; u1: number; v1: number } | undefined,
    tint: readonly [number, number, number],
    skyLevels: Quad4,
    blockLevels: Quad4,
    aoByVertex: Quad4 = DEFAULT_VALUES,
    flipDiagonal = false,
  ): void {
    const [tintR, tintG, tintB] = getLinearTint(tint);
    const vertexOffset = this.positions.length / 3;

    for (let i = 0; i < 4; i++) {
      const corner = face.corners[i]!;
      const [cx, cy, cz] = corner;
      const sky = skyLevels[i]!;
      const block = blockLevels[i]!;
      const ao = aoByVertex[i]!;
      const rawBrightness = getLightBrightness(Math.max(sky, block));

      this.positions.push(x + cx, y + cy, z + cz);
      this.normals.push(face.nx, face.ny, face.nz);
      this.uvs.push(...(uvRect !== undefined
        ? (() => {
            const [localU, localV] = localCornerToTextureUv(face, corner);
            return [
              uvRect.u0 + localU * (uvRect.u1 - uvRect.u0),
              uvRect.v0 + localV * (uvRect.v1 - uvRect.v0),
            ] as const;
          })()
        : [0, 0] as const));

      this.normalColors.push(tintR * rawBrightness * ao, tintG * rawBrightness * ao, tintB * rawBrightness * ao);
      this.debugColors.push(rawBrightness, rawBrightness, rawBrightness);
      this.aoColors.push(ao, ao, ao);
      this.tintColors.push(tintR, tintG, tintB);
      this.skyLightLevels.push(sky);
      this.blockLightLevels.push(block);
      this.aoFactorScalars.push(ao);
    }

    if (flipDiagonal) {
      this.indices.push(
        vertexOffset,
        vertexOffset + 1,
        vertexOffset + 3,
        vertexOffset + 1,
        vertexOffset + 2,
        vertexOffset + 3,
      );
    } else {
      this.indices.push(
        vertexOffset,
        vertexOffset + 1,
        vertexOffset + 2,
        vertexOffset,
        vertexOffset + 2,
        vertexOffset + 3,
      );
    }
  }

  public pushCross(
    x: number,
    y: number,
    z: number,
    uvRect: { u0: number; v0: number; u1: number; v1: number } | undefined,
    tint: readonly [number, number, number],
    light: LightSample,
  ): void {
    const [tintR, tintG, tintB] = getLinearTint(tint);
    const rawBrightness = getLightBrightness(Math.max(light.sky, light.block));

    const u0 = uvRect ? uvRect.u0 : 0;
    const v0 = uvRect ? uvRect.v0 : 0;
    const u1 = uvRect ? uvRect.u1 : 0;
    const v1 = uvRect ? uvRect.v1 : 0;

    let offset = this.positions.length / 3;
    this.positions.push(
      x, y, z,
      x + 1, y, z + 1,
      x + 1, y + 1, z + 1,
      x, y + 1, z,
    );
    for (let i = 0; i < 4; i++) {
      this.normals.push(CROSS_NORMAL_A, 0, CROSS_NORMAL_B);
      this.normalColors.push(tintR * rawBrightness, tintG * rawBrightness, tintB * rawBrightness);
      this.debugColors.push(rawBrightness, rawBrightness, rawBrightness);
      this.aoColors.push(1, 1, 1);
      this.tintColors.push(tintR, tintG, tintB);
      this.skyLightLevels.push(light.sky);
      this.blockLightLevels.push(light.block);
      this.aoFactorScalars.push(1);
    }
    this.uvs.push(u0, v1, u1, v1, u1, v0, u0, v0);
    this.indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);

    offset = this.positions.length / 3;
    this.positions.push(
      x, y, z + 1,
      x + 1, y, z,
      x + 1, y + 1, z,
      x, y + 1, z + 1,
    );
    for (let i = 0; i < 4; i++) {
      this.normals.push(CROSS_NORMAL_A, 0, CROSS_NORMAL_A);
      this.normalColors.push(tintR * rawBrightness, tintG * rawBrightness, tintB * rawBrightness);
      this.debugColors.push(rawBrightness, rawBrightness, rawBrightness);
      this.aoColors.push(1, 1, 1);
      this.tintColors.push(tintR, tintG, tintB);
      this.skyLightLevels.push(light.sky);
      this.blockLightLevels.push(light.block);
      this.aoFactorScalars.push(1);
    }
    this.uvs.push(u0, v1, u1, v1, u1, v0, u0, v0);
    this.indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
  }

  public pushCactusFace(
    faceIndex: number,
    x: number,
    y: number,
    z: number,
    uvRect: { u0: number; v0: number; u1: number; v1: number } | undefined,
    tint: readonly [number, number, number],
    skyLevels: Quad4,
    blockLevels: Quad4,
    aoByVertex: Quad4 = DEFAULT_VALUES,
    flipDiagonal = false,
  ): void {
    const [tintR, tintG, tintB] = getLinearTint(tint);
    const u0 = uvRect ? uvRect.u0 : 0;
    const v0 = uvRect ? uvRect.v0 : 0;
    const u1 = uvRect ? uvRect.u1 : 0;
    const v1 = uvRect ? uvRect.v1 : 0;
    const vertexOffset = this.positions.length / 3;

    const inset = 0.0625;
    const oinset = 1 - inset;

    let px: number[] = [];
    let py: number[] = [];
    let pz: number[] = [];
    let nx = 0;
    let ny = 0;
    let nz = 0;
    let faceUvs: number[] = [];

    switch (faceIndex) {
      case 0:
        px = [x + oinset, x + oinset, x + oinset, x + oinset];
        py = [y, y + 1, y + 1, y];
        pz = [z + inset, z + inset, z + oinset, z + oinset];
        nx = 1; ny = 0; nz = 0;
        faceUvs = [u0 + (u1 - u0) * inset, v1, u0 + (u1 - u0) * inset, v0, u0 + (u1 - u0) * oinset, v0, u0 + (u1 - u0) * oinset, v1];
        break;
      case 1:
        px = [x + inset, x + inset, x + inset, x + inset];
        py = [y, y + 1, y + 1, y];
        pz = [z + oinset, z + oinset, z + inset, z + inset];
        nx = -1; ny = 0; nz = 0;
        faceUvs = [u0 + (u1 - u0) * oinset, v1, u0 + (u1 - u0) * oinset, v0, u0 + (u1 - u0) * inset, v0, u0 + (u1 - u0) * inset, v1];
        break;
      case 2:
        px = [x + inset, x + oinset, x + oinset, x + inset];
        py = [y + 1, y + 1, y + 1, y + 1];
        pz = [z + oinset, z + oinset, z + inset, z + inset];
        nx = 0; ny = 1; nz = 0;
        faceUvs = [u0 + (u1 - u0) * inset, v0 + (v1 - v0) * oinset, u0 + (u1 - u0) * oinset, v0 + (v1 - v0) * oinset, u0 + (u1 - u0) * oinset, v0 + (v1 - v0) * inset, u0 + (u1 - u0) * inset, v0 + (v1 - v0) * inset];
        break;
      case 3:
        px = [x + inset, x + oinset, x + oinset, x + inset];
        py = [y, y, y, y];
        pz = [z + inset, z + inset, z + oinset, z + oinset];
        nx = 0; ny = -1; nz = 0;
        faceUvs = [u0 + (u1 - u0) * inset, v0 + (v1 - v0) * inset, u0 + (u1 - u0) * oinset, v0 + (v1 - v0) * inset, u0 + (u1 - u0) * oinset, v0 + (v1 - v0) * oinset, u0 + (u1 - u0) * inset, v0 + (v1 - v0) * oinset];
        break;
      case 4:
        px = [x + inset, x + oinset, x + oinset, x + inset];
        py = [y, y, y + 1, y + 1];
        pz = [z + oinset, z + oinset, z + oinset, z + oinset];
        nx = 0; ny = 0; nz = 1;
        faceUvs = [u0 + (u1 - u0) * inset, v1, u0 + (u1 - u0) * oinset, v1, u0 + (u1 - u0) * oinset, v0, u0 + (u1 - u0) * inset, v0];
        break;
      case 5:
      default:
        px = [x + oinset, x + inset, x + inset, x + oinset];
        py = [y + 1, y + 1, y, y];
        pz = [z + inset, z + inset, z + inset, z + inset];
        nx = 0; ny = 0; nz = -1;
        faceUvs = [u0 + (u1 - u0) * oinset, v0, u0 + (u1 - u0) * inset, v0, u0 + (u1 - u0) * inset, v1, u0 + (u1 - u0) * oinset, v1];
        break;
    }

    for (let i = 0; i < 4; i++) {
      const sky = skyLevels[i]!;
      const block = blockLevels[i]!;
      const ao = aoByVertex[i]!;
      const rawBrightness = getLightBrightness(Math.max(sky, block));

      this.positions.push(px[i]!, py[i]!, pz[i]!);
      this.normals.push(nx, ny, nz);
      this.uvs.push(faceUvs[i * 2]!, faceUvs[i * 2 + 1]!);
      this.normalColors.push(tintR * rawBrightness * ao, tintG * rawBrightness * ao, tintB * rawBrightness * ao);
      this.debugColors.push(rawBrightness, rawBrightness, rawBrightness);
      this.aoColors.push(ao, ao, ao);
      this.tintColors.push(tintR, tintG, tintB);
      this.skyLightLevels.push(sky);
      this.blockLightLevels.push(block);
      this.aoFactorScalars.push(ao);
    }

    if (flipDiagonal) {
      this.indices.push(
        vertexOffset,
        vertexOffset + 1,
        vertexOffset + 3,
        vertexOffset + 1,
        vertexOffset + 2,
        vertexOffset + 3,
      );
    } else {
      this.indices.push(
        vertexOffset,
        vertexOffset + 1,
        vertexOffset + 2,
        vertexOffset,
        vertexOffset + 2,
        vertexOffset + 3,
      );
    }
  }

  public toGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setAttribute('normalColor', new THREE.Float32BufferAttribute(this.normalColors, 3));
    geometry.setAttribute('debugColor', new THREE.Float32BufferAttribute(this.debugColors, 3));
    geometry.setAttribute('aoColor', new THREE.Float32BufferAttribute(this.aoColors, 3));
    geometry.setAttribute('tintColor', new THREE.Float32BufferAttribute(this.tintColors, 3));
    geometry.setAttribute('skyLightLevel', new THREE.Float32BufferAttribute(this.skyLightLevels, 1));
    geometry.setAttribute('blockLightLevel', new THREE.Float32BufferAttribute(this.blockLightLevels, 1));
    geometry.setAttribute('aoFactorScalar', new THREE.Float32BufferAttribute(this.aoFactorScalars, 1));
    geometry.setAttribute('color', geometry.getAttribute('normalColor'));
    geometry.setIndex(this.indices);
    return geometry;
  }
}

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

  private getLightComponentsAt(chunk: Chunk, lx: number, ly: number, lz: number): LightSample {
    if (ly < 0) {
      return { sky: 0, block: 0 };
    }
    if (ly >= CHUNK_SIZE_Y) {
      return { sky: 15, block: 0 };
    }

    if (chunk.isInBounds(lx, ly, lz)) {
      return {
        sky: chunk.getSkylight(lx, ly, lz),
        block: chunk.getBlocklight(lx, ly, lz),
      };
    }

    const neighbour = this.getChunkAndLocal(chunk, lx, lz);
    if (neighbour === undefined) {
      return { sky: ly >= 64 ? 15 : 0, block: 0 };
    }

    return {
      sky: neighbour.chunk.getSkylight(neighbour.localX, ly, neighbour.localZ),
      block: neighbour.chunk.getBlocklight(neighbour.localX, ly, neighbour.localZ),
    };
  }

  private getBlockAt(chunk: Chunk, lx: number, ly: number, lz: number): BlockId {
    if (ly < 0 || ly >= CHUNK_SIZE_Y) {
      return AIR_BLOCK_ID;
    }

    if (chunk.isInBounds(lx, ly, lz)) {
      return chunk.getBlock(lx, ly, lz);
    }

    const neighbour = this.getChunkAndLocal(chunk, lx, lz);
    if (neighbour === undefined) {
      return AIR_BLOCK_ID;
    }

    return neighbour.chunk.getBlock(neighbour.localX, ly, neighbour.localZ);
  }

  private getChunkAndLocal(
    chunk: Chunk,
    localX: number,
    localZ: number,
  ): { chunk: Chunk; localX: number; localZ: number } | undefined {
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
      return undefined;
    }

    return { chunk: neighbour, localX: x, localZ: z };
  }

  private contributesAmbientOcclusion(blockId: BlockId): boolean {
    const definition = this.blockRegistry.getById(blockId);
    if (definition === undefined) {
      return false;
    }

    return definition.renderType === 'opaque' || definition.renderType === 'cactus';
  }

  private receivesAmbientOcclusion(blockId: BlockId): boolean {
    const definition = this.blockRegistry.getById(blockId);
    if (definition === undefined) {
      return false;
    }

    return definition.renderType === 'opaque' || definition.renderType === 'cactus';
  }

  private isOccluderAt(chunk: Chunk, lx: number, ly: number, lz: number): boolean {
    return this.contributesAmbientOcclusion(this.getBlockAt(chunk, lx, ly, lz));
  }

  private sampleCornerLightComponents(
    chunk: Chunk,
    x: number,
    y: number,
    z: number,
    face: FaceDef,
    corner: Corner,
  ): LightSample {
    if (face.dx !== 0) {
      const yStep = corner[1] === 0 ? -1 : 1;
      const zStep = corner[2] === 0 ? -1 : 1;
      const planeX = x + face.dx;
      const l0 = this.getLightComponentsAt(chunk, planeX, y, z);
      const l1 = this.getLightComponentsAt(chunk, planeX, y + yStep, z);
      const l2 = this.getLightComponentsAt(chunk, planeX, y, z + zStep);
      const l3 = this.getLightComponentsAt(chunk, planeX, y + yStep, z + zStep);
      return {
        sky: (l0.sky + l1.sky + l2.sky + l3.sky) / 4,
        block: (l0.block + l1.block + l2.block + l3.block) / 4,
      };
    }

    if (face.dy !== 0) {
      const xStep = corner[0] === 0 ? -1 : 1;
      const zStep = corner[2] === 0 ? -1 : 1;
      const planeY = y + face.dy;
      const l0 = this.getLightComponentsAt(chunk, x, planeY, z);
      const l1 = this.getLightComponentsAt(chunk, x + xStep, planeY, z);
      const l2 = this.getLightComponentsAt(chunk, x, planeY, z + zStep);
      const l3 = this.getLightComponentsAt(chunk, x + xStep, planeY, z + zStep);
      return {
        sky: (l0.sky + l1.sky + l2.sky + l3.sky) / 4,
        block: (l0.block + l1.block + l2.block + l3.block) / 4,
      };
    }

    const xStep = corner[0] === 0 ? -1 : 1;
    const yStep = corner[1] === 0 ? -1 : 1;
    const planeZ = z + face.dz;
    const l0 = this.getLightComponentsAt(chunk, x, y, planeZ);
    const l1 = this.getLightComponentsAt(chunk, x + xStep, y, planeZ);
    const l2 = this.getLightComponentsAt(chunk, x, y + yStep, planeZ);
    const l3 = this.getLightComponentsAt(chunk, x + xStep, y + yStep, planeZ);
    return {
      sky: (l0.sky + l1.sky + l2.sky + l3.sky) / 4,
      block: (l0.block + l1.block + l2.block + l3.block) / 4,
    };
  }

  private sampleCornerAoFactor(
    chunk: Chunk,
    x: number,
    y: number,
    z: number,
    face: FaceDef,
    corner: Corner,
  ): number {
    let side1: boolean;
    let side2: boolean;
    let diagonal: boolean;

    if (face.dx !== 0) {
      const yStep = corner[1] === 0 ? -1 : 1;
      const zStep = corner[2] === 0 ? -1 : 1;
      const planeX = x + face.dx;
      side1 = this.isOccluderAt(chunk, planeX, y + yStep, z);
      side2 = this.isOccluderAt(chunk, planeX, y, z + zStep);
      diagonal = this.isOccluderAt(chunk, planeX, y + yStep, z + zStep);
    } else if (face.dy !== 0) {
      const xStep = corner[0] === 0 ? -1 : 1;
      const zStep = corner[2] === 0 ? -1 : 1;
      const planeY = y + face.dy;
      side1 = this.isOccluderAt(chunk, x + xStep, planeY, z);
      side2 = this.isOccluderAt(chunk, x, planeY, z + zStep);
      diagonal = this.isOccluderAt(chunk, x + xStep, planeY, z + zStep);
    } else {
      const xStep = corner[0] === 0 ? -1 : 1;
      const yStep = corner[1] === 0 ? -1 : 1;
      const planeZ = z + face.dz;
      side1 = this.isOccluderAt(chunk, x + xStep, y, planeZ);
      side2 = this.isOccluderAt(chunk, x, y + yStep, planeZ);
      diagonal = this.isOccluderAt(chunk, x + xStep, y + yStep, planeZ);
    }

    return AO_LEVEL_TO_FACTOR[vertexAO(side1, side2, diagonal)]!;
  }

  private getSmoothLighting(
    chunk: Chunk,
    x: number,
    y: number,
    z: number,
    blockId: BlockId,
    face: FaceDef,
  ): VertexSmoothLighting {
    if (!this.receivesAmbientOcclusion(blockId)) {
      const light = this.getLightComponentsAt(chunk, x + face.dx, y + face.dy, z + face.dz);
      return {
        skyLevels: [light.sky, light.sky, light.sky, light.sky],
        blockLevels: [light.block, light.block, light.block, light.block],
        aoFactors: DEFAULT_VALUES,
        flipDiagonal: false,
      };
    }

    const l0 = this.sampleCornerLightComponents(chunk, x, y, z, face, face.corners[0]!);
    const l1 = this.sampleCornerLightComponents(chunk, x, y, z, face, face.corners[1]!);
    const l2 = this.sampleCornerLightComponents(chunk, x, y, z, face, face.corners[2]!);
    const l3 = this.sampleCornerLightComponents(chunk, x, y, z, face, face.corners[3]!);

    const ao0 = this.sampleCornerAoFactor(chunk, x, y, z, face, face.corners[0]!);
    const ao1 = this.sampleCornerAoFactor(chunk, x, y, z, face, face.corners[1]!);
    const ao2 = this.sampleCornerAoFactor(chunk, x, y, z, face, face.corners[2]!);
    const ao3 = this.sampleCornerAoFactor(chunk, x, y, z, face, face.corners[3]!);

    return {
      skyLevels: [l0.sky, l1.sky, l2.sky, l3.sky],
      blockLevels: [l0.block, l1.block, l2.block, l3.block],
      aoFactors: [ao0, ao1, ao2, ao3],
      flipDiagonal: ao0 + ao2 > ao1 + ao3,
    };
  }

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
            const neighbourId = this.getBlockAt(chunk, x + face.dx, y + face.dy, z + face.dz);
            if (this.hidesOpaqueFace(neighbourId)) {
              continue;
            }

            const textureName = resolveBlockTexture(definition, face.slot);
            const uvRect = textureName !== undefined ? this.atlas.getUvRect(textureName) : undefined;
            const tint = resolveBlockTint(definition, face.slot);
            const smoothLighting = this.getSmoothLighting(chunk, x, y, z, blockId, face);

            buffers.pushFace(
              face,
              x,
              y,
              z,
              uvRect,
              tint,
              smoothLighting.skyLevels,
              smoothLighting.blockLevels,
              smoothLighting.aoFactors,
              smoothLighting.flipDiagonal,
            );
          }
        }
      }
    }

    return buffers.toGeometry();
  }

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
              const neighbourId = this.getBlockAt(chunk, x + face.dx, y + face.dy, z + face.dz);
              if (this.hidesLeafFace(neighbourId)) {
                continue;
              }
              const textureName = resolveBlockTexture(definition, face.slot);
              const uvRect = textureName !== undefined ? this.atlas.getUvRect(textureName) : undefined;
              const tint = resolveBlockTint(definition, face.slot);
              const light = this.getLightComponentsAt(chunk, x + face.dx, y + face.dy, z + face.dz);
              buffers.pushFace(face, x, y, z, uvRect, tint, [light.sky, light.sky, light.sky, light.sky], [light.block, light.block, light.block, light.block]);
            }
          } else if (renderType === 'cutout') {
            for (const face of FACES) {
              const neighbourId = this.getBlockAt(chunk, x + face.dx, y + face.dy, z + face.dz);
              if (this.hidesCutoutFace(neighbourId)) {
                continue;
              }
              const textureName = resolveBlockTexture(definition, face.slot);
              const uvRect = textureName !== undefined ? this.atlas.getUvRect(textureName) : undefined;
              const tint = resolveBlockTint(definition, face.slot);
              const light = this.getLightComponentsAt(chunk, x + face.dx, y + face.dy, z + face.dz);
              buffers.pushFace(face, x, y, z, uvRect, tint, [light.sky, light.sky, light.sky, light.sky], [light.block, light.block, light.block, light.block]);
            }
          } else if (renderType === 'cross') {
            const textureName = resolveBlockTexture(definition, 'side');
            const uvRect = textureName !== undefined ? this.atlas.getUvRect(textureName) : undefined;
            const tint = resolveBlockTint(definition, 'side');
            const light = this.getLightComponentsAt(chunk, x, y, z);
            buffers.pushCross(x, y, z, uvRect, tint, light);
          } else if (renderType === 'cactus') {
            for (let i = 0; i < 6; i++) {
              const face = FACES[i]!;
              const neighbourId = this.getBlockAt(chunk, x + face.dx, y + face.dy, z + face.dz);
              if (this.hidesCactusFace(i, neighbourId)) {
                continue;
              }
              const slot = i === 2 ? 'top' : (i === 3 ? 'bottom' : 'side');
              const textureName = resolveBlockTexture(definition, slot);
              const uvRect = textureName !== undefined ? this.atlas.getUvRect(textureName) : undefined;
              const tint = resolveBlockTint(definition, slot);
              const smoothLighting = this.getSmoothLighting(chunk, x, y, z, blockId, face);
              buffers.pushCactusFace(i, x, y, z, uvRect, tint, smoothLighting.skyLevels, smoothLighting.blockLevels, smoothLighting.aoFactors, smoothLighting.flipDiagonal);
            }
          }
        }
      }
    }

    return buffers.toGeometry();
  }

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
            const neighbourId = this.getBlockAt(chunk, x + face.dx, y + face.dy, z + face.dz);
            if (this.hidesFluidFace(blockId, neighbourId)) {
              continue;
            }

            const textureName = resolveBlockTexture(definition, face.slot);
            const uvRect = textureName !== undefined ? this.atlas.getUvRect(textureName) : undefined;
            const tint = resolveBlockTint(definition, face.slot);
            const light = this.getLightComponentsAt(chunk, x, y, z);
            buffers.pushFace(face, x, y, z, uvRect, tint, [light.sky, light.sky, light.sky, light.sky], [light.block, light.block, light.block, light.block]);
          }
        }
      }
    }

    return buffers.toGeometry();
  }

  private hidesOpaqueFace(neighbourId: BlockId): boolean {
    const neighbourDef = this.blockRegistry.getById(neighbourId);
    if (neighbourDef === undefined) {
      return false;
    }
    return neighbourDef.solid && !neighbourDef.transparent && neighbourDef.renderType === 'opaque';
  }

  private hidesCutoutFace(neighbourId: BlockId): boolean {
    const neighbourDef = this.blockRegistry.getById(neighbourId);
    if (neighbourDef === undefined) {
      return false;
    }
    return neighbourDef.solid && !neighbourDef.transparent && neighbourDef.renderType === 'opaque';
  }

  private hidesLeafFace(neighbourId: BlockId): boolean {
    const neighbourDef = this.blockRegistry.getById(neighbourId);
    if (neighbourDef === undefined) {
      return false;
    }
    return (neighbourDef.solid && !neighbourDef.transparent && neighbourDef.renderType === 'opaque') || neighbourDef.renderType === 'leaves';
  }

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

  private isFluid(blockId: BlockId): boolean {
    return blockId === BlockIds.Water || blockId === BlockIds.Lava || blockId === BlockIds.LavaStill;
  }

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

  private isOpaqueMeshBlock(blockId: BlockId): boolean {
    const definition = this.blockRegistry.getById(blockId);
    if (definition === undefined) {
      return false;
    }
    return definition.renderType === 'opaque';
  }
}
