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
import { clampedVisibility, getLightBrightness } from './voxelLighting';
import { isFallingFluid } from '../world/fluid/FluidMetadata';
import { FluidTextureKind } from '../world/fluid/FluidTextureKind';
import { computeFluidFlowVector } from '../world/fluid/FluidFlowVector';
import { getBetaFluidCornerHeight } from './fluid/FluidSurfaceGeometry';
import { FLUID_RENDER_SETTINGS } from './fluid/FluidRenderSettings';

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
  public readonly faceBrightness: number[] = [];
  public readonly fluidTextureKinds: number[] = [];
  public readonly fluidFrameUvs: number[] = [];
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

      {
        const visibility = clampedVisibility(rawBrightness, ao);
        this.normalColors.push(tintR * visibility, tintG * visibility, tintB * visibility);
      }
      this.debugColors.push(rawBrightness, rawBrightness, rawBrightness);
      this.aoColors.push(ao, ao, ao);
      this.tintColors.push(tintR, tintG, tintB);
      this.skyLightLevels.push(sky);
      this.blockLightLevels.push(block);
      this.aoFactorScalars.push(ao);
      this.faceBrightness.push(1);
      this.fluidTextureKinds.push(FluidTextureKind.WaterStill);
      this.fluidFrameUvs.push(0, 0);
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
      {
        const visibility = clampedVisibility(rawBrightness, 1);
        this.normalColors.push(tintR * visibility, tintG * visibility, tintB * visibility);
      }
      this.debugColors.push(rawBrightness, rawBrightness, rawBrightness);
      this.aoColors.push(1, 1, 1);
      this.tintColors.push(tintR, tintG, tintB);
      this.skyLightLevels.push(light.sky);
      this.blockLightLevels.push(light.block);
      this.aoFactorScalars.push(1);
      this.faceBrightness.push(1);
      this.fluidTextureKinds.push(FluidTextureKind.WaterStill);
      this.fluidFrameUvs.push(0, 0);
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
      {
        const visibility = clampedVisibility(rawBrightness, 1);
        this.normalColors.push(tintR * visibility, tintG * visibility, tintB * visibility);
      }
      this.debugColors.push(rawBrightness, rawBrightness, rawBrightness);
      this.aoColors.push(1, 1, 1);
      this.tintColors.push(tintR, tintG, tintB);
      this.skyLightLevels.push(light.sky);
      this.blockLightLevels.push(light.block);
      this.aoFactorScalars.push(1);
      this.faceBrightness.push(1);
      this.fluidTextureKinds.push(FluidTextureKind.WaterStill);
      this.fluidFrameUvs.push(0, 0);
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
      {
        const visibility = clampedVisibility(rawBrightness, ao);
        this.normalColors.push(tintR * visibility, tintG * visibility, tintB * visibility);
      }
      this.debugColors.push(rawBrightness, rawBrightness, rawBrightness);
      this.aoColors.push(ao, ao, ao);
      this.tintColors.push(tintR, tintG, tintB);
      this.skyLightLevels.push(sky);
      this.blockLightLevels.push(block);
      this.aoFactorScalars.push(ao);
      this.faceBrightness.push(1);
      this.fluidTextureKinds.push(FluidTextureKind.WaterStill);
      this.fluidFrameUvs.push(0, 0);
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

  public pushQuad(
    vertices: readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]],
    normal: readonly [number, number, number],
    uvRect: { u0: number; v0: number; u1: number; v1: number } | undefined,
    tint: readonly [number, number, number],
    light: LightSample,
    ao = 1,
    fluidTextureKind: FluidTextureKind = FluidTextureKind.WaterStill,
    customUvs?: readonly [number, number, number, number, number, number, number, number],
    customFrameUvs?: readonly [number, number, number, number, number, number, number, number],
    faceBrightness = 1,
  ): void {
    const [tintR, tintG, tintB] = getLinearTint(tint);
    const vertexOffset = this.positions.length / 3;
    const rawBrightness = getLightBrightness(Math.max(light.sky, light.block));
    const visibility = clampedVisibility(rawBrightness, ao) * faceBrightness;
    const u0 = uvRect?.u0 ?? 0;
    const v0 = uvRect?.v0 ?? 0;
    const u1 = uvRect?.u1 ?? 1;
    const v1 = uvRect?.v1 ?? 1;
    const uvs: readonly [number, number, number, number, number, number, number, number] = customUvs ?? [u0, v1, u1, v1, u1, v0, u0, v0];
    for (let i = 0; i < 4; i++) {
      const vertex = vertices[i]!;
      this.positions.push(vertex[0], vertex[1], vertex[2]);
      this.normals.push(normal[0], normal[1], normal[2]);
      this.uvs.push(uvs[i * 2]!, uvs[i * 2 + 1]!);
      this.normalColors.push(tintR * visibility, tintG * visibility, tintB * visibility);
      this.debugColors.push(rawBrightness, rawBrightness, rawBrightness);
      this.aoColors.push(ao, ao, ao);
      this.tintColors.push(tintR, tintG, tintB);
      this.skyLightLevels.push(light.sky);
      this.blockLightLevels.push(light.block);
      this.aoFactorScalars.push(ao);
      this.faceBrightness.push(faceBrightness);
      this.fluidTextureKinds.push(fluidTextureKind);
      const frameUv = customFrameUvs ?? ([0, 1, 1, 1, 1, 0, 0, 0] as const);
      this.fluidFrameUvs.push(frameUv[i * 2]!, frameUv[i * 2 + 1]!);
    }
    this.indices.push(vertexOffset, vertexOffset + 1, vertexOffset + 2, vertexOffset, vertexOffset + 2, vertexOffset + 3);
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
    geometry.setAttribute('faceBrightness', new THREE.Float32BufferAttribute(this.faceBrightness, 1));
    geometry.setAttribute('fluidTextureKind', new THREE.Float32BufferAttribute(this.fluidTextureKinds, 1));
    geometry.setAttribute('fluidFrameUv', new THREE.Float32BufferAttribute(this.fluidFrameUvs, 2));
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

    return definition.contributesAmbientOcclusion ?? (definition.renderType === 'opaque' || definition.renderType === 'cactus');
  }

  private receivesAmbientOcclusion(blockId: BlockId): boolean {
    const definition = this.blockRegistry.getById(blockId);
    if (definition === undefined) {
      return false;
    }

    return definition.receivesAmbientOcclusion ?? (definition.renderType === 'opaque' || definition.renderType === 'cactus');
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
              const smoothLighting = this.getSmoothLighting(chunk, x, y, z, blockId, face);
              buffers.pushFace(face, x, y, z, uvRect, tint, smoothLighting.skyLevels, smoothLighting.blockLevels, smoothLighting.aoFactors, smoothLighting.flipDiagonal);
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
          } else if (renderType === 'cross' && blockId !== BlockIds.Fire) {
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

  /**
   * Builds Beta 1.7.3 fire geometry for a chunk.
   *
   * Ported from RenderBlocks.renderBlockFire(). Two modes:
   * - Ground fire: block below is normal cube or flammable → cross planes
   * - Wall fire: block below is air/non-flammable → quads attached to flammable neighbours
   *
   * Uses `fluidTextureKind` attribute to encode the fire texture tile index
   * for the fire sprite sheet animation system.
   */
  public buildFires(chunk: Chunk): THREE.BufferGeometry {
    const buffers = new MeshBuffers();

    // Frame row indices for the shader.
    // The shader computes: fireFrameY = (row + uFireFrame) / frameCount
    // So row must be the raw index (0 or 1), NOT divided by frame count.
    const ROW0_V0 = 0;
    const ROW0_V1 = 1;    // raw row index, shader divides by 32
    const ROW1_V0 = 1;    // raw row index
    const ROW1_V1 = 2;    // raw row index

    for (let y = 0; y < CHUNK_SIZE_Y; y++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          const blockId = chunk.getBlock(x, y, z);
          if (blockId !== BlockIds.Fire) continue;

          const light = this.getLightComponentsAt(chunk, x, y, z);
          const lightSample: LightSample = { sky: light.sky, block: light.block };

          const below = this.getBlockAt(chunk, x, y - 1, z);
          const isGroundFire = this.isBlockNormalCube(below) || this.canBlockCatchFire(below);

          // Beta: UV alternation based on (x/2 + y/2 + z/2) & 1
          const flipUvs = ((Math.floor(x / 2) + Math.floor(y / 2) + Math.floor(z / 2)) & 1) === 1;

          const H = 1.4;  // fire plane height (Beta var18)
          const Y_OFF = 0.0625; // Y offset (Beta var20)
          const cx = x + 0.5;
          const cz = z + 0.5;

          if (!isGroundFire) {
            // ── Wall fire ─────────────────────────────────────────
            // Beta: quads attached to flammable neighbours.
            // Inset 0.2 (var37), height 1.4, yOff 0.0625.
            // UV row alternates based on (x+y+z) & 1.
            const useAltRow = ((x + y + z) & 1) === 1;
            const v0 = useAltRow ? ROW1_V0 : ROW0_V0;
            const v1 = useAltRow ? ROW1_V1 : ROW0_V1;
            // Beta reverses U on each successive face pair:
            // (-X, +X) share one flip state; (-Z, +Z) share another.
            // Front/back are handled by DoubleSide material.
            const uL = flipUvs ? 1 : 0;
            const uR = flipUvs ? 0 : 1;

            // -X face
            if (this.canBlockCatchFire(this.getBlockAt(chunk, x - 1, y, z))) {
              buffers.pushQuad([
                [x + 0.2, y + H + Y_OFF, z + 1],
                [x, y + Y_OFF, z + 1],
                [x, y + Y_OFF, z],
                [x + 0.2, y + H + Y_OFF, z],
              ], [1, 0, 0], undefined, [1, 1, 1], lightSample, 1,
              FluidTextureKind.WaterStill,
              undefined,
              [uR, v0, uR, v1, uL, v1, uL, v0]);
            }

            // +X face
            if (this.canBlockCatchFire(this.getBlockAt(chunk, x + 1, y, z))) {
              buffers.pushQuad([
                [x + 0.8, y + H + Y_OFF, z],
                [x + 1, y + Y_OFF, z],
                [x + 1, y + Y_OFF, z + 1],
                [x + 0.8, y + H + Y_OFF, z + 1],
              ], [-1, 0, 0], undefined, [1, 1, 1], lightSample, 1,
              FluidTextureKind.WaterStill,
              undefined,
              [uL, v0, uL, v1, uR, v1, uR, v0]);
            }

            // -Z face
            if (this.canBlockCatchFire(this.getBlockAt(chunk, x, y, z - 1))) {
              buffers.pushQuad([
                [x, y + H + Y_OFF, z + 0.2],
                [x, y + Y_OFF, z],
                [x + 1, y + Y_OFF, z],
                [x + 1, y + H + Y_OFF, z + 0.2],
              ], [0, 0, 1], undefined, [1, 1, 1], lightSample, 1,
              FluidTextureKind.WaterStill,
              undefined,
              [uR, v0, uR, v1, uL, v1, uL, v0]);
            }

            // +Z face
            if (this.canBlockCatchFire(this.getBlockAt(chunk, x, y, z + 1))) {
              buffers.pushQuad([
                [x + 1, y + H + Y_OFF, z + 0.8],
                [x + 1, y + Y_OFF, z + 1],
                [x, y + Y_OFF, z + 1],
                [x, y + H + Y_OFF, z + 0.8],
              ], [0, 0, -1], undefined, [1, 1, 1], lightSample, 1,
              FluidTextureKind.WaterStill,
              undefined,
              [uL, v0, uL, v1, uR, v1, uR, v0]);
            }

            // +Y face (fire hanging from flammable block above)
            if (this.canBlockCatchFire(this.getBlockAt(chunk, x, y + 1, z))) {
              const topY = y + 1;
              const hang = -0.2;
              if (((x + y + z) & 1) === 0) {
                // Diagonal A (Beta: var29→var21 along X, z=0→z=1)
                buffers.pushQuad([
                  [x + 0.5 - 0.5, topY + hang, z],
                  [x + 0.5 + 0.5, topY, z],
                  [x + 0.5 + 0.5, topY, z + 1],
                  [x + 0.5 - 0.5, topY + hang, z + 1],
                ], [0, -1, 0], undefined, [1, 1, 1], lightSample, 1,
                FluidTextureKind.WaterStill,
                undefined,
                [1, ROW1_V0, 1, ROW1_V1, 0, ROW1_V1, 0, ROW1_V0]);
                // Diagonal B
                buffers.pushQuad([
                  [x + 0.5 + 0.5, topY + hang, z + 1],
                  [x + 0.5 - 0.5, topY, z + 1],
                  [x + 0.5 - 0.5, topY, z],
                  [x + 0.5 + 0.5, topY + hang, z],
                ], [0, 1, 0], undefined, [1, 1, 1], lightSample, 1,
                FluidTextureKind.WaterStill,
                undefined,
                [1, ROW0_V0, 1, ROW0_V1, 0, ROW0_V1, 0, ROW0_V0]);
              } else {
                // Diagonal A (Beta: z+0.5+0.5→z+0.5-0.5 along Z, x=0→x=1)
                buffers.pushQuad([
                  [x, topY + hang, z + 0.5 + 0.5],
                  [x, topY, z + 0.5 - 0.5],
                  [x + 1, topY, z + 0.5 - 0.5],
                  [x + 1, topY + hang, z + 0.5 + 0.5],
                ], [0, -1, 0], undefined, [1, 1, 1], lightSample, 1,
                FluidTextureKind.WaterStill,
                undefined,
                [1, ROW1_V0, 1, ROW1_V1, 0, ROW1_V1, 0, ROW1_V0]);
                // Diagonal B
                buffers.pushQuad([
                  [x + 1, topY + hang, z + 0.5 - 0.5],
                  [x + 1, topY, z + 0.5 + 0.5],
                  [x, topY, z + 0.5 + 0.5],
                  [x, topY + hang, z + 0.5 - 0.5],
                ], [0, 1, 0], undefined, [1, 1, 1], lightSample, 1,
                FluidTextureKind.WaterStill,
                undefined,
                [1, ROW0_V0, 1, ROW0_V1, 0, ROW0_V1, 0, ROW0_V0]);
              }
            }

          } else {
            // ── Ground fire ───────────────────────────────────────
            // Beta renderBlockFire ground-fire branch (else block):
            // Three pairs of diagonal planes at increasing widths.
            // Each pair: 2 quads (one per diagonal), each double-sided
            // via DoubleSide material.
            //
            // Pair 1: narrow (±0.2),   UV row depends on (x+y+z)&1
            // Pair 2: medium (±0.3),   opposite UV row
            // Pair 3: full   (±0.5),   same UV row as pair 1

            const narrowI = 0.2;
            const mediumI = 0.3;
            const fullI = 0.5;

            // Beta UV row alternation for ground fire:
            // (x+y+z) & 1 selects which row pair 1 uses.
            const useAltRow = ((x + y + z) & 1) === 1;
            const v0P1 = useAltRow ? ROW1_V0 : ROW0_V0;
            const v1P1 = useAltRow ? ROW1_V1 : ROW0_V1;
            const v0P2 = useAltRow ? ROW0_V0 : ROW1_V0;
            const v1P2 = useAltRow ? ROW0_V1 : ROW1_V1;
            // Pair 3 uses same row as pair 1
            const v0P3 = v0P1;
            const v1P3 = v1P1;

            const uL = flipUvs ? 1 : 0;
            const uR = flipUvs ? 0 : 1;

            // ── Pair 1: narrow cross (±0.2) ──
            // Plane A: runs along X axis (z=0 → z=1)
            buffers.pushQuad([
              [cx - narrowI, y + H + Y_OFF, z + 1],
              [cx + narrowI, y + Y_OFF, z + 1],
              [cx + narrowI, y + Y_OFF, z],
              [cx - narrowI, y + H + Y_OFF, z],
            ], [1, 0, 0], undefined, [1, 1, 1], lightSample, 1,
            FluidTextureKind.WaterStill,
            undefined,
            [uR, v0P1, uR, v1P1, uL, v1P1, uL, v0P1]);

            // Plane B: runs along Z axis (x=0 → x=1)
            buffers.pushQuad([
              [x + 1, y + H + Y_OFF, cz + narrowI],
              [x + 1, y + Y_OFF, cz - narrowI],
              [x, y + Y_OFF, cz - narrowI],
              [x, y + H + Y_OFF, cz + narrowI],
            ], [0, 0, 1], undefined, [1, 1, 1], lightSample, 1,
            FluidTextureKind.WaterStill,
            undefined,
            [uL, v0P1, uL, v1P1, uR, v1P1, uR, v0P1]);

            // ── Pair 2: medium cross (±0.3) ──
            buffers.pushQuad([
              [cx - mediumI, y + H + Y_OFF, z + 1],
              [cx + mediumI, y + Y_OFF, z + 1],
              [cx + mediumI, y + Y_OFF, z],
              [cx - mediumI, y + H + Y_OFF, z],
            ], [1, 0, 0], undefined, [1, 1, 1], lightSample, 1,
            FluidTextureKind.WaterStill,
            undefined,
            [uR, v0P2, uR, v1P2, uL, v1P2, uL, v0P2]);

            buffers.pushQuad([
              [x + 1, y + H + Y_OFF, cz + mediumI],
              [x + 1, y + Y_OFF, cz - mediumI],
              [x, y + Y_OFF, cz - mediumI],
              [x, y + H + Y_OFF, cz + mediumI],
            ], [0, 0, 1], undefined, [1, 1, 1], lightSample, 1,
            FluidTextureKind.WaterStill,
            undefined,
            [uL, v0P2, uL, v1P2, uR, v1P2, uR, v0P2]);

            // ── Pair 3: full-width cross (±0.5) ──
            buffers.pushQuad([
              [cx - fullI, y + H + Y_OFF, z + 1],
              [cx + fullI, y + Y_OFF, z + 1],
              [cx + fullI, y + Y_OFF, z],
              [cx - fullI, y + H + Y_OFF, z],
            ], [1, 0, 0], undefined, [1, 1, 1], lightSample, 1,
            FluidTextureKind.WaterStill,
            undefined,
            [uR, v0P3, uR, v1P3, uL, v1P3, uL, v0P3]);

            buffers.pushQuad([
              [x + 1, y + H + Y_OFF, cz + fullI],
              [x + 1, y + Y_OFF, cz - fullI],
              [x, y + Y_OFF, cz - fullI],
              [x, y + H + Y_OFF, cz + fullI],
            ], [0, 0, 1], undefined, [1, 1, 1], lightSample, 1,
            FluidTextureKind.WaterStill,
            undefined,
            [uL, v0P3, uL, v1P3, uR, v1P3, uR, v0P3]);
          }
        }
      }
    }

    return buffers.toGeometry();
  }

  /**
   * Beta BlockFire.canBlockCatchFire().
   * Returns true if the block has encouragement > 0 in the flammability table.
   */
  private canBlockCatchFire(blockId: BlockId): boolean {
    // Match the flammability table from FireBehaviour
    switch (blockId) {
      case BlockIds.Planks:
      case BlockIds.Fence:
      case BlockIds.WoodStairs:
      case BlockIds.Log:
      case BlockIds.SpruceLog:
      case BlockIds.Leaves:
      case BlockIds.SpruceLeaves:
      case BlockIds.Bookshelf:
      case BlockIds.TNT:
      case BlockIds.TallGrass:
      case BlockIds.Wool:
        return true;
      default:
        return false;
    }
  }

  /**
   * Beta World.isBlockNormalCube().
   * True if the block is solid, opaque, and a full cube.
   */
  private isBlockNormalCube(blockId: BlockId): boolean {
    const def = this.blockRegistry.getById(blockId);
    return def !== undefined && def.solid && !def.transparent;
  }

  public buildFluids(chunk: Chunk): THREE.BufferGeometry {
    const buffers = new MeshBuffers();

    for (let y = 0; y < CHUNK_SIZE_Y; y++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          const blockId = chunk.getBlock(x, y, z);
          if (!this.isFluid(blockId)) continue;
          const definition = this.blockRegistry.getById(blockId);
          if (definition === undefined) continue;
          const textureName = resolveBlockTexture(definition, 'side');
          const uvRect = textureName !== undefined ? this.atlas.getUvRect(textureName) : undefined;
          const tint = resolveBlockTint(definition, 'side');
          // Each visible fluid face samples the cell on the other side of
          // that face. In particular, open-sky water must use the light above
          // the surface rather than the attenuated light stored in the fluid.
          // Directional Beta multipliers are applied separately below.
          const topLight = this.getLightComponentsAt(chunk, x, y + 1, z);
          const plusXLight = this.getLightComponentsAt(chunk, x + 1, y, z);
          const minusXLight = this.getLightComponentsAt(chunk, x - 1, y, z);
          const plusZLight = this.getLightComponentsAt(chunk, x, y, z + 1);
          const minusZLight = this.getLightComponentsAt(chunk, x, y, z - 1);
          const bottomLight = this.getLightComponentsAt(chunk, x, y - 1, z);
          const metadata = chunk.getBlockMetadata(x, y, z);
          const sideTextureKind = this.getFluidTextureKind(blockId, metadata, 'side');
          const flow = this.computeFluidFlow(chunk, x, y, z, blockId);
          const topTextureKind = this.getFluidTextureKind(blockId, metadata, 'top', flow.x, flow.z);
          const topUvs = this.buildFluidTopUvs(flow.x, flow.z, topTextureKind);
          const sameAbove = this.sameFluidMaterial(blockId, this.getBlockAt(chunk, x, y + 1, z));
          const h00 = this.getFluidCornerHeight(chunk, x, y, z, blockId, 0, 0);
          const h10 = this.getFluidCornerHeight(chunk, x, y, z, blockId, 1, 0);
          const h11 = this.getFluidCornerHeight(chunk, x, y, z, blockId, 1, 1);
          const h01 = this.getFluidCornerHeight(chunk, x, y, z, blockId, 0, 1);
          // Beta maps each side's upper V coordinate from its corner height;
          // a full-height surface starts at V=0 and a partial surface starts
          // lower in the same logical frame. Vertex order is bottom-left,
          // top-left, top-right, bottom-right for every side below.
          const sideFrameUvs = {
            plusX: this.scaleFluidFrameUvs(sideTextureKind, [0, 1, 0, 1 - h10, 1, 1 - h11, 1, 1]),
            minusX: this.scaleFluidFrameUvs(sideTextureKind, [0, 1, 0, 1 - h01, 1, 1 - h00, 1, 1]),
            plusZ: this.scaleFluidFrameUvs(sideTextureKind, [0, 1, 0, 1 - h11, 1, 1 - h01, 1, 1]),
            minusZ: this.scaleFluidFrameUvs(sideTextureKind, [0, 1, 0, 1 - h00, 1, 1 - h10, 1, 1]),
          };

          if (!sameAbove) {
            buffers.pushQuad([
              [x, y + h01, z + 1],
              [x + 1, y + h11, z + 1],
              [x + 1, y + h10, z],
              [x, y + h00, z],
            ], [0, 1, 0], uvRect, tint, topLight, 1, topTextureKind, undefined, topUvs, 1);
          }

          // +X
          if (!this.hidesFluidFace(blockId, this.getBlockAt(chunk, x + 1, y, z))) {
            buffers.pushQuad([[x + 1, y, z], [x + 1, y + h10, z], [x + 1, y + h11, z + 1], [x + 1, y, z + 1]], [1, 0, 0], uvRect, tint, plusXLight, 1, sideTextureKind, undefined, sideFrameUvs.plusX, 0.6);
          }
          // -X
          if (!this.hidesFluidFace(blockId, this.getBlockAt(chunk, x - 1, y, z))) {
            buffers.pushQuad([[x, y, z + 1], [x, y + h01, z + 1], [x, y + h00, z], [x, y, z]], [-1, 0, 0], uvRect, tint, minusXLight, 1, sideTextureKind, undefined, sideFrameUvs.minusX, 0.6);
          }
          // +Z
          if (!this.hidesFluidFace(blockId, this.getBlockAt(chunk, x, y, z + 1))) {
            buffers.pushQuad([[x + 1, y, z + 1], [x + 1, y + h11, z + 1], [x, y + h01, z + 1], [x, y, z + 1]], [0, 0, 1], uvRect, tint, plusZLight, 1, sideTextureKind, undefined, sideFrameUvs.plusZ, 0.8);
          }
          // -Z
          if (!this.hidesFluidFace(blockId, this.getBlockAt(chunk, x, y, z - 1))) {
            buffers.pushQuad([[x, y, z], [x, y + h00, z], [x + 1, y + h10, z], [x + 1, y, z]], [0, 0, -1], uvRect, tint, minusZLight, 1, sideTextureKind, undefined, sideFrameUvs.minusZ, 0.8);
          }
          if (!this.hidesFluidFace(blockId, this.getBlockAt(chunk, x, y - 1, z))) {
            buffers.pushQuad([[x, y, z], [x + 1, y, z], [x + 1, y, z + 1], [x, y, z + 1]], [0, -1, 0], uvRect, tint, bottomLight, 1, sideTextureKind, undefined, undefined, 0.5);
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

  private hidesLeafFace(_neighbourId: BlockId): boolean {
    return false;
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

  private getFluidTextureKind(
    blockId: BlockId,
    metadata: number,
    face: 'top' | 'side',
    flowX = 0,
    flowZ = 0,
  ): FluidTextureKind {
    const falling = isFallingFluid(metadata);
    const movingTop = face === 'top' && Math.hypot(flowX, flowZ) > 1e-6;

    // Beta BlockFluid.func_218_a selects the flowing tile for every side
    // face, including stationary water/lava blocks. Still/flowing selection
    // is a top-face decision; the block ID alone must not make stationary
    // side faces use the still tile.
    if (face === 'side' || falling || movingTop) {
      return blockId === BlockIds.LavaStill || blockId === BlockIds.LavaFlowing
        ? FluidTextureKind.LavaFlow
        : FluidTextureKind.WaterFlow;
    }
    if (blockId === BlockIds.LavaStill || blockId === BlockIds.LavaFlowing) return FluidTextureKind.LavaStill;
    return FluidTextureKind.WaterStill;
  }

  private buildFluidTopUvs(
    flowX: number,
    flowZ: number,
    kind: FluidTextureKind,
  ): readonly [number, number, number, number, number, number, number, number] | undefined {
    const flowing = kind === FluidTextureKind.WaterFlow || kind === FluidTextureKind.LavaFlow;
    if (!flowing || Math.hypot(flowX, flowZ) < 1e-6) return undefined;
    // The project top-face UV basis is opposite to the world-flow basis;
    // reverse only this final conversion so the sampled pattern travels with
    // the computed flow vector. Simulation and vector calculation are intact.
    const angle = -(Math.atan2(flowZ, flowX) - Math.PI / 2);
    const base: ReadonlyArray<readonly [number, number]> = [[0, 1], [1, 1], [1, 0], [0, 0]];
    const out: number[] = [];
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    for (const [u, v] of base) {
      const x = u - 0.5;
      const y = v - 0.5;
      out.push(x * c - y * s + 0.5, x * s + y * c + 0.5);
    }
    return this.scaleFluidFrameUvs(kind, out as [number, number, number, number, number, number, number, number]);
  }

  private scaleFluidFrameUvs(
    kind: FluidTextureKind,
    uvs: readonly [number, number, number, number, number, number, number, number],
  ): readonly [number, number, number, number, number, number, number, number] {
    const scale = kind === FluidTextureKind.LavaFlow
      ? FLUID_RENDER_SETTINGS.lavaFlowScale
      : kind === FluidTextureKind.WaterFlow
        ? FLUID_RENDER_SETTINGS.waterFlowScale
        : 1;
    if (scale === 1) return uvs;
    const result = [...uvs] as [number, number, number, number, number, number, number, number];
    for (let i = 0; i < result.length; i++) result[i] = (result[i]! - 0.5) * scale + 0.5;
    return result;
  }

  private computeFluidFlow(chunk: Chunk, x: number, y: number, z: number, blockId: BlockId): { x: number; z: number; falling: boolean } {
    return computeFluidFlowVector({
      getBlock: (wx, wy, wz) => this.getBlockAt(chunk, wx, wy, wz),
      getMetadata: (wx, wy, wz) => this.getMetadataAt(chunk, wx, wy, wz),
      isSolid: (id) => this.isSolidForFluidHeight(id),
    }, x, y, z, blockId);
  }

  private isFluid(blockId: BlockId): boolean {
    return blockId === BlockIds.WaterFlowing || blockId === BlockIds.WaterStill || blockId === BlockIds.LavaFlowing || blockId === BlockIds.LavaStill;
  }

  private sameFluidMaterial(a: BlockId, b: BlockId): boolean {
    const waterA = a === BlockIds.WaterFlowing || a === BlockIds.WaterStill;
    const waterB = b === BlockIds.WaterFlowing || b === BlockIds.WaterStill;
    const lavaA = a === BlockIds.LavaFlowing || a === BlockIds.LavaStill;
    const lavaB = b === BlockIds.LavaFlowing || b === BlockIds.LavaStill;
    return (waterA && waterB) || (lavaA && lavaB);
  }

  private getFluidCornerHeight(chunk: Chunk, x: number, y: number, z: number, blockId: BlockId, dx: number, dz: number): number {
    // Beta's corner sampler is anchored at the lower-left sample for each
    // corner. The dx/dz signs select the adjacent cells touching that corner;
    // keep this mapping explicit so X/Z and negative chunk borders stay clear.
    const cornerX = dx === 0 ? x : x + 1;
    const cornerZ = dz === 0 ? z : z + 1;
    return getBetaFluidCornerHeight(
      {
        getBlock: (sampleX, sampleY, sampleZ) => this.getBlockAt(chunk, sampleX, sampleY, sampleZ),
        getMetadata: (sampleX, sampleY, sampleZ) => this.getMetadataAt(chunk, sampleX, sampleY, sampleZ),
        isSameFluid: (a, b) => this.sameFluidMaterial(a as BlockId, b as BlockId),
        isSolidForFluidHeight: (sampleId) => this.isSolidForFluidHeight(sampleId as BlockId),
      },
      cornerX,
      y,
      cornerZ,
      blockId,
    );
  }

  private getMetadataAt(chunk: Chunk, lx: number, ly: number, lz: number): number {
    if (ly < 0 || ly >= CHUNK_SIZE_Y) return 0;
    if (chunk.isInBounds(lx, ly, lz)) return chunk.getBlockMetadata(lx, ly, lz);
    const neighbour = this.getChunkAndLocal(chunk, lx, lz);
    return neighbour?.chunk.getBlockMetadata(neighbour.localX, ly, neighbour.localZ) ?? 0;
  }

  private isSolidForFluidHeight(blockId: BlockId): boolean {
    const def = this.blockRegistry.getById(blockId);
    return def !== undefined && def.solid && def.renderType !== 'leaves';
  }

  private hidesFluidFace(fluidBlockId: BlockId, neighbourId: BlockId): boolean {
    if (this.sameFluidMaterial(fluidBlockId, neighbourId)) {
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
