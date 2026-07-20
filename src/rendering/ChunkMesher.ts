import * as THREE from 'three';
import type { BlockId } from '../blocks/BlockId';
import { BlockIds } from '../blocks/BlockId';
import { FaceDirection, type BlockFace } from '../blocks/BlockFace';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { BlockDefinition } from '../blocks/BlockDefinition';
import { resolveBlockTexture, resolveSlabTexture } from '../blocks/resolveBlockTexture';
import { resolveBlockTint } from '../blocks/resolveBlockTint';
import { vegetationTintKind, type VegetationColorProvider } from '../world/generation/climate/VegetationColors';
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
  readonly slot?: BlockFace;
  readonly dir?: FaceDirection;
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

  public pushLadder(
    x: number,
    y: number,
    z: number,
    metadata: number,
    uvRect: { u0: number; v0: number; u1: number; v1: number } | undefined,
    tint: readonly [number, number, number],
    light: LightSample
  ): void {
    const u0 = uvRect ? uvRect.u0 : 0;
    const v0 = uvRect ? uvRect.v0 : 0;
    const u1 = uvRect ? uvRect.u1 : 0;
    const v1 = uvRect ? uvRect.v1 : 0;

    let nx = 0, nz = 1;
    let v: [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]];

    if (metadata === 2) {
      nx = 0; nz = -1;
      v = [[x, y, z + 0.95], [x + 1, y, z + 0.95], [x + 1, y + 1, z + 0.95], [x, y + 1, z + 0.95]];
    } else if (metadata === 3) {
      nx = 0; nz = 1;
      v = [[x + 1, y, z + 0.05], [x, y, z + 0.05], [x, y + 1, z + 0.05], [x + 1, y + 1, z + 0.05]];
    } else if (metadata === 4) {
      nx = -1; nz = 0;
      v = [[x + 0.95, y, z + 1], [x + 0.95, y, z], [x + 0.95, y + 1, z], [x + 0.95, y + 1, z + 1]];
    } else {
      nx = 1; nz = 0;
      v = [[x + 0.05, y, z], [x + 0.05, y, z + 1], [x + 0.05, y + 1, z + 1], [x + 0.05, y + 1, z]];
    }

    this.pushQuad(v, [nx, 0, nz], uvRect, tint, light, 1, FluidTextureKind.WaterStill, [u0, v1, u1, v1, u1, v0, u0, v0]);
    const vBack = [v[3]!, v[2]!, v[1]!, v[0]!] as const;
    this.pushQuad(vBack, [-nx, 0, -nz], uvRect, tint, light, 1, FluidTextureKind.WaterStill, [u0, v0, u1, v0, u1, v1, u0, v1]);
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
  private readonly vegetationColors: VegetationColorProvider | undefined;

  public constructor(chunkManager: ChunkManager, blockRegistry: BlockRegistry, atlas: TextureAtlas, vegetationColors?: VegetationColorProvider) {
    this.chunkManager = chunkManager; this.blockRegistry = blockRegistry; this.atlas = atlas; this.vegetationColors = vegetationColors;
  }

  private resolveVegetationTint(blockId: BlockId, face: BlockFace, fallback: readonly [number, number, number], worldX: number, worldZ: number): readonly [number, number, number] {
    const kind = vegetationTintKind(blockId, face);
    return kind === undefined || this.vegetationColors === undefined ? fallback : this.vegetationColors.getColorAt(kind, worldX, worldZ);
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

  private getMaxNeighborLight(chunk: Chunk, x: number, y: number, z: number): LightSample {
    const selfLight = this.getLightComponentsAt(chunk, x, y, z);
    const east = this.getLightComponentsAt(chunk, x + 1, y, z);
    const west = this.getLightComponentsAt(chunk, x - 1, y, z);
    const south = this.getLightComponentsAt(chunk, x, y, z + 1);
    const north = this.getLightComponentsAt(chunk, x, y, z - 1);
    const up = this.getLightComponentsAt(chunk, x, y + 1, z);
    
    return {
      sky: Math.max(selfLight.sky, east.sky, west.sky, south.sky, north.sky, up.sky),
      block: Math.max(selfLight.block, east.block, west.block, south.block, north.block, up.block),
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

            // Snow-covered grass: Beta BlockGrass.getBlockTexture() checks
            // if block above has Material.snow → use grass_side_snowed (texture 68)
            let textureName = resolveBlockTexture(definition, face.slot!);
            if (blockId === BlockIds.DoubleSlab) {
              const metadata = chunk.getBlockMetadata(x, y, z);
              textureName = resolveSlabTexture(face.slot! === 'front' ? 'side' : (face.slot! === 'back' ? 'side' : face.slot!), metadata);
            }
            if (blockId === BlockIds.Grass && face.slot! === 'side') {
              const above = this.getBlockAt(chunk, x, y + 1, z);
              if (above === BlockIds.Snow || above === BlockIds.SnowBlock) {
                textureName = 'grass_side_snowed';
              }
            }
            const uvRect = this.getSafeUvRect(textureName);
            const tint = this.resolveVegetationTint(blockId, face.slot!, resolveBlockTint(definition, face.slot!), chunk.chunkX * CHUNK_SIZE_X + x, chunk.chunkZ * CHUNK_SIZE_Z + z);
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

  private getSafeUvRect(textureName: string | undefined): { u0: number; v0: number; u1: number; v1: number } | undefined {
    if (textureName === undefined) return undefined;
    let rect = this.atlas.getUvRect(textureName);
    if (rect === undefined) {
      console.warn(`[ChunkMesher] Unresolved texture key: "${textureName}". Using missing_texture fallback.`);
      rect = this.atlas.getUvRect('missing_texture');
    }
    return rect;
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
              const textureName = resolveBlockTexture(definition, face.slot!);
              const uvRect = textureName !== undefined ? this.atlas.getUvRect(textureName) : undefined;
              const tint = this.resolveVegetationTint(blockId, face.slot!, resolveBlockTint(definition, face.slot!), chunk.chunkX * CHUNK_SIZE_X + x, chunk.chunkZ * CHUNK_SIZE_Z + z);
              const smoothLighting = this.getSmoothLighting(chunk, x, y, z, blockId, face);
              buffers.pushFace(face, x, y, z, uvRect, tint, smoothLighting.skyLevels, smoothLighting.blockLevels, smoothLighting.aoFactors, smoothLighting.flipDiagonal);
            }
          } else if (renderType === 'cutout') {
            if (blockId === BlockIds.Slab) {
              this.buildSlab(buffers, chunk, x, y, z, blockId, definition);
              continue;
            }
            if (blockId === BlockIds.WoodDoor || blockId === BlockIds.IronDoor) {
              this.buildDoor(buffers, chunk, x, y, z, blockId, definition);
              continue;
            }
            if (blockId === BlockIds.Trapdoor) {
              this.buildTrapdoor(buffers, chunk, x, y, z, blockId, definition);
              continue;
            }
            if (blockId === BlockIds.StonePressurePlate || blockId === BlockIds.WoodPressurePlate) {
              this.buildPressurePlate(buffers, chunk, x, y, z, blockId, definition);
              continue;
            }
            if (blockId === BlockIds.StoneButton) {
              this.buildButton(buffers, chunk, x, y, z, blockId, definition);
              continue;
            }
            if (blockId === BlockIds.Lever) {
              this.buildLever(buffers, chunk, x, y, z, blockId, definition);
              continue;
            }
            if (blockId === BlockIds.SignPost) {
              this.buildStandingSign(buffers, chunk, x, y, z, blockId, definition);
              continue;
            }
            if (blockId === BlockIds.WallSign) {
              this.buildWallSign(buffers, chunk, x, y, z, blockId, definition);
              continue;
            }

            if (blockId === BlockIds.Ladder) {
              const textureName = resolveBlockTexture(definition, 'side') ?? 'ladder';
              let uvRect = this.atlas.getUvRect(textureName);
              if (uvRect === undefined) {
                console.warn(`[ChunkMesher] Unresolved ladder texture key: "${textureName}". Using missing_texture fallback.`);
                uvRect = this.atlas.getUvRect('missing_texture');
              }
              const tint = this.resolveVegetationTint(blockId, 'side', resolveBlockTint(definition, 'side'), chunk.chunkX * CHUNK_SIZE_X + x, chunk.chunkZ * CHUNK_SIZE_Z + z);
              const light = this.getMaxNeighborLight(chunk, x, y, z);
              const metadata = chunk.getBlockMetadata(x, y, z);
              buffers.pushLadder(x, y, z, metadata, uvRect, tint, light);
              continue;
            }
            for (const face of FACES) {
              const neighbourId = this.getBlockAt(chunk, x + face.dx, y + face.dy, z + face.dz);
              if (this.hidesCutoutFace(neighbourId)) {
                continue;
              }
              const textureName = resolveBlockTexture(definition, face.slot!);
              const uvRect = this.getSafeUvRect(textureName);
              const tint = this.resolveVegetationTint(blockId, face.slot!, resolveBlockTint(definition, face.slot!), chunk.chunkX * CHUNK_SIZE_X + x, chunk.chunkZ * CHUNK_SIZE_Z + z);
              const light = this.getLightComponentsAt(chunk, x + face.dx, y + face.dy, z + face.dz);
              buffers.pushFace(face, x, y, z, uvRect, tint, [light.sky, light.sky, light.sky, light.sky], [light.block, light.block, light.block, light.block]);
            }
          } else if (renderType === 'cross' && blockId !== BlockIds.Fire) {
            const textureName = resolveBlockTexture(definition, 'side');
            const uvRect = this.getSafeUvRect(textureName);
            const tint = this.resolveVegetationTint(blockId, 'side', resolveBlockTint(definition, 'side'), chunk.chunkX * CHUNK_SIZE_X + x, chunk.chunkZ * CHUNK_SIZE_Z + z);
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
              const uvRect = this.getSafeUvRect(textureName);
              const tint = resolveBlockTint(definition, slot);
              const smoothLighting = this.getSmoothLighting(chunk, x, y, z, blockId, face);
              buffers.pushCactusFace(i, x, y, z, uvRect, tint, smoothLighting.skyLevels, smoothLighting.blockLevels, smoothLighting.aoFactors, smoothLighting.flipDiagonal);
            }
          } else if (renderType === 'snow') {
            // Beta BlockSnow: flat layer at height 1/8
            // Uses custom bounds: 0,0,0 to 1, 0.125, 1
            const textureName = resolveBlockTexture(definition, 'side');
            const uvRect = this.getSafeUvRect(textureName);
            const tint = this.resolveVegetationTint(blockId, 'side', resolveBlockTint(definition, 'side'), chunk.chunkX * CHUNK_SIZE_X + x, chunk.chunkZ * CHUNK_SIZE_Z + z);
            const light = this.getLightComponentsAt(chunk, x, y, z);
            this.pushSnowBlock(buffers, x, y, z, uvRect, tint, light);
          } else if (renderType === 'ice') {
            // Beta ice: rendered as translucent (pass 1), same as fluids
            // Skip here — ice will be handled in buildFluids or a separate translucent pass
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

    // All fire planes use the SAME texture row (row 0).
    // The shader advances the animation frame uniformly for the entire block.
    // Every plane belonging to the same fire block is synchronized.
    const V0 = 0;  // raw row index, shader divides by 32
    const V1 = 1;  // raw row index

    for (let y = 0; y < CHUNK_SIZE_Y; y++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          const blockId = chunk.getBlock(x, y, z);
          if (blockId !== BlockIds.Fire) continue;

          const light = this.getLightComponentsAt(chunk, x, y, z);
          const lightSample: LightSample = { sky: light.sky, block: light.block };

          const below = this.getBlockAt(chunk, x, y - 1, z);
          const isGroundFire = this.isBlockNormalCube(below) || this.canBlockCatchFire(below);

          // Beta: UV flip based on (x/2 + y/2 + z/2) & 1
          const flipUvs = ((Math.floor(x / 2) + Math.floor(y / 2) + Math.floor(z / 2)) & 1) === 1;
          const uL = flipUvs ? 1 : 0;
          const uR = flipUvs ? 0 : 1;

          const H = 1.4;       // Beta var18
          const Y_OFF = 0.0625; // Beta var20

          if (!isGroundFire) {
            // ── Wall fire ─────────────────────────────────────────
            // Beta: tilted quads attached to flammable horizontal neighbours.
            // Inset 0.2 (var37), height 1.4, yOff 0.0625.
            // All planes use the same texture row.

            // -X face
            if (this.canBlockCatchFire(this.getBlockAt(chunk, x - 1, y, z))) {
              buffers.pushQuad([
                [x + 0.2, y + H + Y_OFF, z + 1],
                [x, y + Y_OFF, z + 1],
                [x, y + Y_OFF, z],
                [x + 0.2, y + H + Y_OFF, z],
              ], [1, 0, 0], undefined, [1, 1, 1], lightSample, 1,
              FluidTextureKind.WaterStill, undefined,
              [uR, V0, uR, V1, uL, V1, uL, V0]);
            }

            // +X face
            if (this.canBlockCatchFire(this.getBlockAt(chunk, x + 1, y, z))) {
              buffers.pushQuad([
                [x + 0.8, y + H + Y_OFF, z],
                [x + 1, y + Y_OFF, z],
                [x + 1, y + Y_OFF, z + 1],
                [x + 0.8, y + H + Y_OFF, z + 1],
              ], [-1, 0, 0], undefined, [1, 1, 1], lightSample, 1,
              FluidTextureKind.WaterStill, undefined,
              [uL, V0, uL, V1, uR, V1, uR, V0]);
            }

            // -Z face
            if (this.canBlockCatchFire(this.getBlockAt(chunk, x, y, z - 1))) {
              buffers.pushQuad([
                [x, y + H + Y_OFF, z + 0.2],
                [x, y + Y_OFF, z],
                [x + 1, y + Y_OFF, z],
                [x + 1, y + H + Y_OFF, z + 0.2],
              ], [0, 0, 1], undefined, [1, 1, 1], lightSample, 1,
              FluidTextureKind.WaterStill, undefined,
              [uR, V0, uR, V1, uL, V1, uL, V0]);
            }

            // +Z face
            if (this.canBlockCatchFire(this.getBlockAt(chunk, x, y, z + 1))) {
              buffers.pushQuad([
                [x + 1, y + H + Y_OFF, z + 0.8],
                [x + 1, y + Y_OFF, z + 1],
                [x, y + Y_OFF, z + 1],
                [x, y + H + Y_OFF, z + 0.8],
              ], [0, 0, -1], undefined, [1, 1, 1], lightSample, 1,
              FluidTextureKind.WaterStill, undefined,
              [uL, V0, uL, V1, uR, V1, uR, V0]);
            }

            // +Y face (fire hanging from flammable block above)
            if (this.canBlockCatchFire(this.getBlockAt(chunk, x, y + 1, z))) {
              const topY = y + 1;
              const hang = -0.2;
              if (((x + y + z) & 1) === 0) {
                buffers.pushQuad([
                  [x, topY + hang, z],
                  [x + 1, topY, z],
                  [x + 1, topY, z + 1],
                  [x, topY + hang, z + 1],
                ], [0, -1, 0], undefined, [1, 1, 1], lightSample, 1,
                FluidTextureKind.WaterStill, undefined,
                [1, V0, 1, V1, 0, V1, 0, V0]);
                buffers.pushQuad([
                  [x + 1, topY + hang, z + 1],
                  [x, topY, z + 1],
                  [x, topY, z],
                  [x + 1, topY + hang, z],
                ], [0, 1, 0], undefined, [1, 1, 1], lightSample, 1,
                FluidTextureKind.WaterStill, undefined,
                [1, V0, 1, V1, 0, V1, 0, V0]);
              } else {
                buffers.pushQuad([
                  [x, topY + hang, z + 1],
                  [x, topY, z],
                  [x + 1, topY, z],
                  [x + 1, topY + hang, z + 1],
                ], [0, -1, 0], undefined, [1, 1, 1], lightSample, 1,
                FluidTextureKind.WaterStill, undefined,
                [1, V0, 1, V1, 0, V1, 0, V0]);
                buffers.pushQuad([
                  [x + 1, topY + hang, z],
                  [x + 1, topY, z + 1],
                  [x, topY, z + 1],
                  [x, topY + hang, z],
                ], [0, 1, 0], undefined, [1, 1, 1], lightSample, 1,
                FluidTextureKind.WaterStill, undefined,
                [1, V0, 1, V1, 0, V1, 0, V0]);
              }
            }

          } else {
            // ── Ground fire ───────────────────────────────────────
            // Beta renderBlockFire ground-fire (else branch):
            //
            // TWO perpendicular planes, 90° apart, forming a cross:
            //   Plane A (Z-axis): x=0.3→0.7, z=0→1, front+back
            //   Plane B (X-axis): z=0.3→0.7, x=0→1, front+back
            //
            // Total: exactly 4 quads. No overlapping coplanar planes.
            // All use the same texture row (row 0).
            //
            // Beta variable mapping (with x=0, z=0):
            //   var19 = x+0.7, var21 = x+0.3  (Z-plane width 0.4)
            //   var23 = z+0.7, var25 = z+0.3  (X-plane width 0.4)

            // ── Plane A: Z-axis (x = 0.3 → 0.7, z = 0 → 1) ──
            // Front face
            buffers.pushQuad([
              [x + 1, y + H + Y_OFF, z + 1],
              [x + 1, y, z + 1],
              [x + 1, y, z],
              [x + 1, y + H + Y_OFF, z],
            ], [1, 0, 0], undefined, [1, 1, 1], lightSample, 1,
            FluidTextureKind.WaterStill, undefined,
            [uR, V0, uR, V1, uL, V1, uL, V0]);
            // Back face
            buffers.pushQuad([
              [x + 0.0, y + H + Y_OFF, z + 1],
              [x + 0.0, y, z + 1],
              [x + 0.0, y, z],
              [x + 0., y + H + Y_OFF, z],
            ], [-1, 0, 0], undefined, [1, 1, 1], lightSample, 1,
            FluidTextureKind.WaterStill, undefined,
            [uL, V0, uL, V1, uR, V1, uR, V0]);

            // ── Plane B: X-axis (z = 0.3 or 0.7, x = 0 → 1) ──
            // Front plane at z + 0.3
            buffers.pushQuad([
              [x, y + H + Y_OFF, z + 0],
              [x, y, z + 0],
              [x + 1, y, z + 0],
              [x + 1, y + H + Y_OFF, z + 0],
            ], [0, 0, 1], undefined, [1, 1, 1], lightSample, 1,
            FluidTextureKind.WaterStill, undefined,
            [uR, V0, uR, V1, uL, V1, uL, V0]);
            // Back face
            buffers.pushQuad([
              [x + 1, y + H + Y_OFF, z + 1],
              [x + 1, y, z + 1],
              [x, y, z + 1],
              [x, y + H + Y_OFF, z + 1],
            ], [0, 0, -1], undefined, [1, 1, 1], lightSample, 1,
            FluidTextureKind.WaterStill, undefined,
            [uL, V0, uL, V1, uR, V1, uR, V0]);
          }
        }
      }
    }

    return buffers.toGeometry();
  }
  /**
   * Renders a snow layer block as a flat box at height 0.125 (1/8).
   * Matches Beta's BlockSnow bounds: 0,0,0 to 1, 0.125, 1.
   * Only the top face and four side faces are rendered (no bottom).
   */
  private pushSnowBlock(
    buffers: MeshBuffers,
    x: number,
    y: number,
    z: number,
    uvRect: { u0: number; v0: number; u1: number; v1: number } | undefined,
    tint: readonly [number, number, number],
    light: LightSample,
  ): void {
    const H = 0.125; // 1/8 block height

    // Top face (normal: 0, 1, 0)
    buffers.pushFace(
      { nx: 0, ny: 1, nz: 0, dx: 0, dy: 1, dz: 0, slot: 'top',
        corners: [[0, H, 1], [1, H, 1], [1, H, 0], [0, H, 0]] },
      x, y, z, uvRect, tint,
      [light.sky, light.sky, light.sky, light.sky],
      [light.block, light.block, light.block, light.block],
    );

    // +X side
    buffers.pushFace(
      { nx: 1, ny: 0, nz: 0, dx: 1, dy: 0, dz: 0, slot: 'side',
        corners: [[1, 0, 0], [1, H, 0], [1, H, 1], [1, 0, 1]] },
      x, y, z, uvRect, tint,
      [light.sky, light.sky, light.sky, light.sky],
      [light.block, light.block, light.block, light.block],
    );

    // -X side
    buffers.pushFace(
      { nx: -1, ny: 0, nz: 0, dx: -1, dy: 0, dz: 0, slot: 'side',
        corners: [[0, 0, 1], [0, H, 1], [0, H, 0], [0, 0, 0]] },
      x, y, z, uvRect, tint,
      [light.sky, light.sky, light.sky, light.sky],
      [light.block, light.block, light.block, light.block],
    );

    // +Z side
    buffers.pushFace(
      { nx: 0, ny: 0, nz: 1, dx: 0, dy: 0, dz: 1, slot: 'side',
        corners: [[0, 0, 1], [1, 0, 1], [1, H, 1], [0, H, 1]] },
      x, y, z, uvRect, tint,
      [light.sky, light.sky, light.sky, light.sky],
      [light.block, light.block, light.block, light.block],
    );

    // -Z side
    buffers.pushFace(
      { nx: 0, ny: 0, nz: -1, dx: 0, dy: 0, dz: -1, slot: 'side',
        corners: [[0, H, 0], [1, H, 0], [1, 0, 0], [0, 0, 0]] },
      x, y, z, uvRect, tint,
      [light.sky, light.sky, light.sky, light.sky],
      [light.block, light.block, light.block, light.block],
    );
  }

  private canBlockCatchFire(blockId: BlockId): boolean {
    // Match the flammability table from FireBehaviour
    switch (blockId) {
      case BlockIds.Planks:
      case BlockIds.Fence:
      case BlockIds.WoodStairs:
      case BlockIds.Log:
      case BlockIds.SpruceLog:
      case BlockIds.BirchLog:
      case BlockIds.Leaves:
      case BlockIds.SpruceLeaves:
      case BlockIds.BirchLeaves:
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

  /**
   * Builds translucent solid geometry for a chunk (Ice, Glass).
   * Ice/Glass are full cubes rendered in translucent pass (Beta pass 1).
   * NOT fluids — no fluid surface logic.
   * Culls:
   *  - Same block type (Ice-Ice, Glass-Glass) → hidden internal face
   *  - Opaque solid neighbours (Stone etc) → hidden
   *  - Shows against transparent (Water, Lava, other translucent type, Air, Leaves, etc)
   * This matches Beta BlockBreakable.shouldSideBeRendered and the task requirement
   * that adjacent Ice faces are absent from geometry (10 faces for two adjacent Ice).
   */
  public buildTranslucent(chunk: Chunk): THREE.BufferGeometry {
    const buffers = new MeshBuffers();

    for (let y = 0; y < CHUNK_SIZE_Y; y++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          const blockId = chunk.getBlock(x, y, z);
          if (!this.isTranslucentSolid(blockId)) continue;

          const definition = this.blockRegistry.getById(blockId);
          if (definition === undefined) continue;

          for (const face of FACES) {
            const neighbourId = this.getBlockAt(chunk, x + face.dx, y + face.dy, z + face.dz);
            // Cull same translucent type (Ice-Ice, Glass-Glass) — required by task #1
            if (neighbourId === blockId) continue;
            // Cull against opaque solids (Stone, Dirt, etc.)
            if (this.hidesOpaqueFace(neighbourId)) continue;

            const textureName = resolveBlockTexture(definition, face.slot!);
            const uvRect = this.getSafeUvRect(textureName);
            const tint = this.resolveVegetationTint(blockId, face.slot!, resolveBlockTint(definition, face.slot!), chunk.chunkX * CHUNK_SIZE_X + x, chunk.chunkZ * CHUNK_SIZE_Z + z);
            const smoothLighting = this.getSmoothLighting(chunk, x, y, z, blockId, face);

            buffers.pushFace(
              face, x, y, z, uvRect, tint,
              smoothLighting.skyLevels, smoothLighting.blockLevels,
              smoothLighting.aoFactors, smoothLighting.flipDiagonal,
            );
          }
        }
      }
    }

    return buffers.toGeometry();
  }

  public buildWater(chunk: Chunk): THREE.BufferGeometry {
    const buffers = new MeshBuffers();

    for (let y = 0; y < CHUNK_SIZE_Y; y++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          const blockId = chunk.getBlock(x, y, z);
          if (!this.isWater(blockId)) continue;
          const definition = this.blockRegistry.getById(blockId);
          if (definition === undefined) continue;

          this.buildFluidBlock(buffers, chunk, x, y, z, blockId, definition);
        }
      }
    }

    return buffers.toGeometry();
  }

  public buildLava(chunk: Chunk): THREE.BufferGeometry {
    const buffers = new MeshBuffers();

    for (let y = 0; y < CHUNK_SIZE_Y; y++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          const blockId = chunk.getBlock(x, y, z);
          if (!this.isLava(blockId)) continue;
          const definition = this.blockRegistry.getById(blockId);
          if (definition === undefined) continue;

          this.buildFluidBlock(buffers, chunk, x, y, z, blockId, definition);
        }
      }
    }

    return buffers.toGeometry();
  }

  /** @deprecated Use buildWater or buildLava instead. */
  public buildFluids(chunk: Chunk): THREE.BufferGeometry {
    // Combine both for backward compatibility
    const waterGeo = this.buildWater(chunk);
    const lavaGeo = this.buildLava(chunk);
    // Merge geometries (simple approach - in practice we'd want to merge buffers)
    // For now return water; lava will be handled separately by ChunkRenderer
    lavaGeo.dispose();
    return waterGeo;
  }

  private buildFluidBlock(
    buffers: MeshBuffers,
    chunk: Chunk,
    x: number,
    y: number,
    z: number,
    blockId: BlockId,
    definition: BlockDefinition,
  ): void {
    const textureName = resolveBlockTexture(definition, 'side');
    const uvRect = this.getSafeUvRect(textureName);
    const tint = this.resolveVegetationTint(blockId, 'side', resolveBlockTint(definition, 'side'), chunk.chunkX * CHUNK_SIZE_X + x, chunk.chunkZ * CHUNK_SIZE_Z + z);
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

  private isIce(blockId: BlockId): boolean {
    return blockId === BlockIds.Ice;
  }

  private isGlass(blockId: BlockId): boolean {
    // Glass may not exist in older registry, use numeric check 20 as fallback
    return blockId === (BlockIds as any).Glass || blockId === 20;
  }

  private isTranslucentSolid(blockId: BlockId): boolean {
    return this.isIce(blockId) || this.isGlass(blockId);
  }

  private isWater(blockId: BlockId): boolean {
    return blockId === BlockIds.WaterFlowing || blockId === BlockIds.WaterStill;
  }

  private isLava(blockId: BlockId): boolean {
    return blockId === BlockIds.LavaFlowing || blockId === BlockIds.LavaStill;
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

  private buildSlab(
    buffers: MeshBuffers,
    chunk: Chunk,
    x: number,
    y: number,
    z: number,
    blockId: BlockId,
    definition: BlockDefinition,
  ): void {
    const H = 0.5; // half height
    const metadata = chunk.getBlockMetadata(x, y, z);
    const tint = this.resolveVegetationTint(blockId, 'side', resolveBlockTint(definition, 'side'), chunk.chunkX * CHUNK_SIZE_X + x, chunk.chunkZ * CHUNK_SIZE_Z + z);
    const light = this.getLightComponentsAt(chunk, x, y, z);
    const l = [light.sky, light.sky, light.sky, light.sky] as Quad4;
    const b = [light.block, light.block, light.block, light.block] as Quad4;

    const resolveTex = (slot: 'top' | 'bottom' | 'side') => {
      return resolveSlabTexture(slot, metadata);
    };

    const pushSlabFace = (
      nx: number, ny: number, nz: number, dx: number, dy: number, dz: number,
      slot: 'top' | 'bottom' | 'side',
      corners: [Corner, Corner, Corner, Corner]
    ) => {
      const texName = resolveTex(slot);
      const uvRect = this.getSafeUvRect(texName);
      buffers.pushFace(
        { nx, ny, nz, dx, dy, dz, slot, corners },
        x, y, z, uvRect, tint, l, b
      );
    };

    const belowId = this.getBlockAt(chunk, x, y - 1, z);
    if (!this.hidesOpaqueFace(belowId)) {
      pushSlabFace(0, -1, 0, 0, -1, 0, 'bottom', [
        [0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]
      ]);
    }

    const aboveId = this.getBlockAt(chunk, x, y + 1, z);
    if (!this.hidesOpaqueFace(aboveId)) {
      pushSlabFace(0, 1, 0, 0, 1, 0, 'top', [
        [0, H, 1], [1, H, 1], [1, H, 0], [0, H, 0]
      ]);
    }

    const sides: Array<{ nx: number; nz: number; dx: number; dz: number; corners: [Corner, Corner, Corner, Corner] }> = [
      { nx: 1, nz: 0, dx: 1, dz: 0, corners: [[1, 0, 0], [1, H, 0], [1, H, 1], [1, 0, 1]] },
      { nx: -1, nz: 0, dx: -1, dz: 0, corners: [[0, 0, 1], [0, H, 1], [0, H, 0], [0, 0, 0]] },
      { nx: 0, nz: 1, dx: 0, dz: 1, corners: [[0, 0, 1], [1, 0, 1], [1, H, 1], [0, H, 1]] },
      { nx: 0, nz: -1, dx: 0, dz: -1, corners: [[0, H, 0], [1, H, 0], [1, 0, 0], [0, 0, 0]] }
    ];

    for (const s of sides) {
      const adjId = this.getBlockAt(chunk, x + s.dx, y, z + s.dz);
      const isOpaqueFull = this.hidesOpaqueFace(adjId);
      const isSameSlab = adjId === blockId;
      if (!isOpaqueFull && !isSameSlab) {
        pushSlabFace(s.nx, 0, s.nz, s.dx, 0, s.dz, 'side', s.corners);
      }
    }
  }

  private buildDoor(buffers: MeshBuffers, chunk: Chunk, x: number, y: number, z: number, blockId: BlockId, definition: BlockDefinition): void {
    const metadata = chunk.getBlockMetadata(x, y, z);
    const isUpper = (metadata & 8) !== 0;
    
    let baseMeta = metadata;
    if (isUpper) {
      if (y > 0) {
        const lowerId = this.getBlockAt(chunk, x, y - 1, z);
        if (lowerId === blockId) {
          baseMeta = this.getMetadataAt(chunk, x, y - 1, z);
        }
      }
    }

    const state = (baseMeta & 4) === 0 ? (baseMeta - 1) & 3 : baseMeta & 3;
    const thickness = 3 / 16;
    
    let minX = 0, minZ = 0, maxX = 1, maxZ = 1;
    
    if (state === 0) { minX = 0; maxX = 1; minZ = 0; maxZ = thickness; }
    else if (state === 1) { minX = 1 - thickness; maxX = 1; minZ = 0; maxZ = 1; }
    else if (state === 2) { minX = 0; maxX = 1; minZ = 1 - thickness; maxZ = 1; }
    else if (state === 3) { minX = 0; maxX = thickness; minZ = 0; maxZ = 1; }

    const textureName = resolveBlockTexture(definition, 'side') || 'door_wood_lower';
    let actualTexture = textureName;
    if (isUpper && textureName.endsWith('_lower')) {
      actualTexture = textureName.replace('_lower', '_upper');
    }
    const uvRect = this.getSafeUvRect(actualTexture);
    const tint = this.resolveVegetationTint(blockId, 'side', resolveBlockTint(definition, 'side'), chunk.chunkX * CHUNK_SIZE_X + x, chunk.chunkZ * CHUNK_SIZE_Z + z);
    const light = this.getMaxNeighborLight(chunk, x, y, z);
    const l = [light.sky, light.sky, light.sky, light.sky] as Quad4;
    const b = [light.block, light.block, light.block, light.block] as Quad4;

    const pushQuadFromBounds = (
      dir: FaceDirection,
      p0: [number, number, number], p1: [number, number, number], p2: [number, number, number], p3: [number, number, number],
      normal: [number, number, number]
    ) => {
      if (!uvRect) return;
      buffers.pushFace({ nx: normal[0], ny: normal[1], nz: normal[2], dx: normal[0], dy: normal[1], dz: normal[2], dir: dir, corners: [p0, p1, p2, p3] as any }, x, y, z, uvRect, tint, l, b);
    };

    pushQuadFromBounds(FaceDirection.EAST, [maxX, 0, minZ], [maxX, 1, minZ], [maxX, 1, maxZ], [maxX, 0, maxZ], [1, 0, 0]);
    pushQuadFromBounds(FaceDirection.WEST, [minX, 0, maxZ], [minX, 1, maxZ], [minX, 1, minZ], [minX, 0, minZ], [-1, 0, 0]);
    pushQuadFromBounds(FaceDirection.TOP, [minX, 1, maxZ], [maxX, 1, maxZ], [maxX, 1, minZ], [minX, 1, minZ], [0, 1, 0]);
    pushQuadFromBounds(FaceDirection.BOTTOM, [minX, 0, minZ], [maxX, 0, minZ], [maxX, 0, maxZ], [minX, 0, maxZ], [0, -1, 0]);
    pushQuadFromBounds(FaceDirection.SOUTH, [minX, 0, maxZ], [maxX, 0, maxZ], [maxX, 1, maxZ], [minX, 1, maxZ], [0, 0, 1]);
    pushQuadFromBounds(FaceDirection.NORTH, [maxX, 0, minZ], [minX, 0, minZ], [minX, 1, minZ], [maxX, 1, minZ], [0, 0, -1]);
  }

  private buildTrapdoor(buffers: MeshBuffers, chunk: Chunk, x: number, y: number, z: number, blockId: BlockId, definition: BlockDefinition): void {
    const meta = chunk.getBlockMetadata(x, y, z);
    const isOpened = (meta & 4) !== 0;
    const attachMeta = meta & 3;
    const thickness = 3 / 16;
    
    let minX = 0, minZ = 0, maxX = 1, maxZ = 1, minY = 0, maxY = thickness;

    if (isOpened) {
      if (attachMeta === 0) { minX = 0; maxX = thickness; minY = 0; maxY = 1; }
      else if (attachMeta === 1) { minX = 1 - thickness; maxX = 1; minY = 0; maxY = 1; }
      else if (attachMeta === 2) { minZ = 0; maxZ = thickness; minY = 0; maxY = 1; }
      else if (attachMeta === 3) { minZ = 1 - thickness; maxZ = 1; minY = 0; maxY = 1; }
    }

    const textureName = resolveBlockTexture(definition, 'side') || 'trapdoor';
    const uvRect = this.getSafeUvRect(textureName);
    const tint = this.resolveVegetationTint(blockId, 'side', resolveBlockTint(definition, 'side'), chunk.chunkX * CHUNK_SIZE_X + x, chunk.chunkZ * CHUNK_SIZE_Z + z);
    const light = this.getMaxNeighborLight(chunk, x, y, z);
    const l = [light.sky, light.sky, light.sky, light.sky] as Quad4;
    const b = [light.block, light.block, light.block, light.block] as Quad4;

    const pushQuadFromBounds = (dir: FaceDirection, p0: any, p1: any, p2: any, p3: any, normal: any) => {
      buffers.pushFace({ nx: normal[0], ny: normal[1], nz: normal[2], dx: normal[0], dy: normal[1], dz: normal[2], dir: dir, corners: [p0, p1, p2, p3] as any }, x, y, z, uvRect, tint, l, b);
    };

    pushQuadFromBounds(FaceDirection.EAST, [maxX, minY, minZ], [maxX, maxY, minZ], [maxX, maxY, maxZ], [maxX, minY, maxZ], [1, 0, 0]);
    pushQuadFromBounds(FaceDirection.WEST, [minX, minY, maxZ], [minX, maxY, maxZ], [minX, maxY, minZ], [minX, minY, minZ], [-1, 0, 0]);
    pushQuadFromBounds(FaceDirection.TOP, [minX, maxY, maxZ], [maxX, maxY, maxZ], [maxX, maxY, minZ], [minX, maxY, minZ], [0, 1, 0]);
    pushQuadFromBounds(FaceDirection.BOTTOM, [minX, minY, minZ], [maxX, minY, minZ], [maxX, minY, maxZ], [minX, minY, maxZ], [0, -1, 0]);
    pushQuadFromBounds(FaceDirection.SOUTH, [minX, minY, maxZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], [minX, maxY, maxZ], [0, 0, 1]);
    pushQuadFromBounds(FaceDirection.NORTH, [maxX, minY, minZ], [minX, minY, minZ], [minX, maxY, minZ], [maxX, maxY, minZ], [0, 0, -1]);
  }

  private buildPressurePlate(buffers: MeshBuffers, chunk: Chunk, x: number, y: number, z: number, blockId: BlockId, definition: BlockDefinition): void {
    const meta = chunk.getBlockMetadata(x, y, z);
    const pressed = meta === 1;
    const thickness = pressed ? 1/16 : 2/16;
    const padding = 1/16;
    
    let minX = padding, minZ = padding, maxX = 1 - padding, maxZ = 1 - padding, minY = 0, maxY = thickness;

    const textureName = resolveBlockTexture(definition, 'top') || 'stone';
    const uvRect = this.getSafeUvRect(textureName);
    const tint = this.resolveVegetationTint(blockId, 'top', resolveBlockTint(definition, 'top'), chunk.chunkX * CHUNK_SIZE_X + x, chunk.chunkZ * CHUNK_SIZE_Z + z);
    const light = this.getMaxNeighborLight(chunk, x, y, z);
    const l = [light.sky, light.sky, light.sky, light.sky] as Quad4;
    const b = [light.block, light.block, light.block, light.block] as Quad4;

    const pushQuadFromBounds = (dir: FaceDirection, p0: any, p1: any, p2: any, p3: any, normal: any) => {
      buffers.pushFace({ nx: normal[0], ny: normal[1], nz: normal[2], dx: normal[0], dy: normal[1], dz: normal[2], dir: dir, corners: [p0, p1, p2, p3] as any }, x, y, z, uvRect, tint, l, b);
    };

    pushQuadFromBounds(FaceDirection.EAST, [maxX, minY, minZ], [maxX, maxY, minZ], [maxX, maxY, maxZ], [maxX, minY, maxZ], [1, 0, 0]);
    pushQuadFromBounds(FaceDirection.WEST, [minX, minY, maxZ], [minX, maxY, maxZ], [minX, maxY, minZ], [minX, minY, minZ], [-1, 0, 0]);
    pushQuadFromBounds(FaceDirection.TOP, [minX, maxY, maxZ], [maxX, maxY, maxZ], [maxX, maxY, minZ], [minX, maxY, minZ], [0, 1, 0]);
    pushQuadFromBounds(FaceDirection.BOTTOM, [minX, minY, minZ], [maxX, minY, minZ], [maxX, minY, maxZ], [minX, minY, maxZ], [0, -1, 0]);
    pushQuadFromBounds(FaceDirection.SOUTH, [minX, minY, maxZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], [minX, maxY, maxZ], [0, 0, 1]);
    pushQuadFromBounds(FaceDirection.NORTH, [maxX, minY, minZ], [minX, minY, minZ], [minX, maxY, minZ], [maxX, maxY, minZ], [0, 0, -1]);
  }

  private buildButton(buffers: MeshBuffers, chunk: Chunk, x: number, y: number, z: number, blockId: BlockId, definition: BlockDefinition): void {
    const meta = chunk.getBlockMetadata(x, y, z);
    const pressed = (meta & 8) !== 0;
    const dir = meta & 7;

    const depth = pressed ? 1/16 : 2/16;
    const w = 6/16;
    const h = 4/16;
    
    let minX = 0.5 - w/2, maxX = 0.5 + w/2;
    let minY = 0.5 - h/2, maxY = 0.5 + h/2;
    let minZ = 0.5 - w/2, maxZ = 0.5 + w/2;

    if (dir === 1) { minX = 0; maxX = depth; minZ = 0.5 - w/2; maxZ = 0.5 + w/2; }
    else if (dir === 2) { minX = 1 - depth; maxX = 1; minZ = 0.5 - w/2; maxZ = 0.5 + w/2; }
    else if (dir === 3) { minZ = 0; maxZ = depth; minX = 0.5 - w/2; maxX = 0.5 + w/2; }
    else if (dir === 4) { minZ = 1 - depth; maxZ = 1; minX = 0.5 - w/2; maxX = 0.5 + w/2; }

    const textureName = resolveBlockTexture(definition, 'side') || 'stone';
    const uvRect = this.getSafeUvRect(textureName);
    const tint = this.resolveVegetationTint(blockId, 'side', resolveBlockTint(definition, 'side'), chunk.chunkX * CHUNK_SIZE_X + x, chunk.chunkZ * CHUNK_SIZE_Z + z);
    const light = this.getMaxNeighborLight(chunk, x, y, z);
    const l = [light.sky, light.sky, light.sky, light.sky] as Quad4;
    const b = [light.block, light.block, light.block, light.block] as Quad4;

    const pushQuadFromBounds = (faceDir: FaceDirection, p0: any, p1: any, p2: any, p3: any, normal: any) => {
      buffers.pushFace({ nx: normal[0], ny: normal[1], nz: normal[2], dx: normal[0], dy: normal[1], dz: normal[2], dir: faceDir, corners: [p0, p1, p2, p3] as any }, x, y, z, uvRect, tint, l, b);
    };

    pushQuadFromBounds(FaceDirection.EAST, [maxX, minY, minZ], [maxX, maxY, minZ], [maxX, maxY, maxZ], [maxX, minY, maxZ], [1, 0, 0]);
    pushQuadFromBounds(FaceDirection.WEST, [minX, minY, maxZ], [minX, maxY, maxZ], [minX, maxY, minZ], [minX, minY, minZ], [-1, 0, 0]);
    pushQuadFromBounds(FaceDirection.TOP, [minX, maxY, maxZ], [maxX, maxY, maxZ], [maxX, maxY, minZ], [minX, maxY, minZ], [0, 1, 0]);
    pushQuadFromBounds(FaceDirection.BOTTOM, [minX, minY, minZ], [maxX, minY, minZ], [maxX, minY, maxZ], [minX, minY, maxZ], [0, -1, 0]);
    pushQuadFromBounds(FaceDirection.SOUTH, [minX, minY, maxZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], [minX, maxY, maxZ], [0, 0, 1]);
    pushQuadFromBounds(FaceDirection.NORTH, [maxX, minY, minZ], [minX, minY, minZ], [minX, maxY, minZ], [maxX, maxY, minZ], [0, 0, -1]);
  }

  private buildLever(buffers: MeshBuffers, chunk: Chunk, x: number, y: number, z: number, blockId: BlockId, definition: BlockDefinition): void {
    const meta = chunk.getBlockMetadata(x, y, z);
    const active = (meta & 8) !== 0;
    const dir = meta & 7;

    const baseDepth = 3/16;
    let minX = 0.5 - 2/16, maxX = 0.5 + 2/16;
    let minY = 0.5 - 3/16, maxY = 0.5 + 3/16;
    let minZ = 0.5 - 2/16, maxZ = 0.5 + 2/16;

    if (dir === 1) { minX = 0; maxX = baseDepth; minY = 0.5 - 3/16; maxY = 0.5 + 3/16; minZ = 0.5 - 2/16; maxZ = 0.5 + 2/16; }
    else if (dir === 2) { minX = 1 - baseDepth; maxX = 1; minY = 0.5 - 3/16; maxY = 0.5 + 3/16; minZ = 0.5 - 2/16; maxZ = 0.5 + 2/16; }
    else if (dir === 3) { minX = 0.5 - 2/16; maxX = 0.5 + 2/16; minY = 0.5 - 3/16; maxY = 0.5 + 3/16; minZ = 0; maxZ = baseDepth; }
    else if (dir === 4) { minX = 0.5 - 2/16; maxX = 0.5 + 2/16; minY = 0.5 - 3/16; maxY = 0.5 + 3/16; minZ = 1 - baseDepth; maxZ = 1; }
    else if (dir === 5) { minX = 0.5 - 2/16; maxX = 0.5 + 2/16; minY = 0; maxY = baseDepth; minZ = 0.5 - 3/16; maxZ = 0.5 + 3/16; }
    else { minX = 0.5 - 3/16; maxX = 0.5 + 3/16; minY = 0; maxY = baseDepth; minZ = 0.5 - 2/16; maxZ = 0.5 + 2/16; }

    const cobbleRect = this.getSafeUvRect('cobblestone');
    const planksRect = this.getSafeUvRect('planks_oak');
    const tint = this.resolveVegetationTint(blockId, 'side', resolveBlockTint(definition, 'side'), chunk.chunkX * CHUNK_SIZE_X + x, chunk.chunkZ * CHUNK_SIZE_Z + z);
    const light = this.getMaxNeighborLight(chunk, x, y, z);

    const pushBaseFace = (nx: number, ny: number, nz: number, dx: number, dy: number, dz: number, corners: [Corner, Corner, Corner, Corner], _faceDir: FaceDirection) => {
      buffers.pushFace({ nx, ny, nz, dx, dy, dz, slot: 'side', corners }, x, y, z, cobbleRect, tint, [light.sky, light.sky, light.sky, light.sky], [light.block, light.block, light.block, light.block]);
    };

    // 1. Render Base Plate (Cobblestone)
    pushBaseFace(1, 0, 0, 1, 0, 0, [[maxX, minY, minZ], [maxX, maxY, minZ], [maxX, maxY, maxZ], [maxX, minY, maxZ]], FaceDirection.EAST);
    pushBaseFace(-1, 0, 0, -1, 0, 0, [[minX, minY, maxZ], [minX, maxY, maxZ], [minX, maxY, minZ], [minX, minY, minZ]], FaceDirection.WEST);
    pushBaseFace(0, 1, 0, 0, 1, 0, [[minX, maxY, maxZ], [maxX, maxY, maxZ], [maxX, maxY, minZ], [minX, maxY, minZ]], FaceDirection.TOP);
    pushBaseFace(0, -1, 0, 0, -1, 0, [[minX, minY, minZ], [maxX, minY, minZ], [maxX, minY, maxZ], [minX, minY, maxZ]], FaceDirection.BOTTOM);
    pushBaseFace(0, 0, 1, 0, 0, 1, [[minX, minY, maxZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], [minX, maxY, maxZ]], FaceDirection.SOUTH);
    pushBaseFace(0, 0, -1, 0, 0, -1, [[maxX, minY, minZ], [minX, minY, minZ], [minX, maxY, minZ], [maxX, maxY, minZ]], FaceDirection.NORTH);

    // 2. Render Rotated Lever Stick (Wood Planks)
    let px = 0.5, py = 0.5, pz = 0.5;
    let dx = 0, dy = 1, dz = 0;

    if (dir === 1) { px = baseDepth; py = 0.5; pz = 0.5; dx = 0.707; dy = active ? 0.707 : -0.707; dz = 0; }
    else if (dir === 2) { px = 1 - baseDepth; py = 0.5; pz = 0.5; dx = -0.707; dy = active ? 0.707 : -0.707; dz = 0; }
    else if (dir === 3) { px = 0.5; py = 0.5; pz = baseDepth; dx = 0; dy = active ? 0.707 : -0.707; dz = 0.707; }
    else if (dir === 4) { px = 0.5; py = 0.5; pz = 1 - baseDepth; dx = 0; dy = active ? 0.707 : -0.707; dz = -0.707; }
    else if (dir === 5) { px = 0.5; py = baseDepth; pz = 0.5; dx = 0; dy = 0.707; dz = active ? 0.707 : -0.707; }
    else { px = 0.5; py = baseDepth; pz = 0.5; dx = active ? 0.707 : -0.707; dy = 0.707; dz = 0; }

    const L = 10/16; // Lever stick length
    const W = 0.75/16; // Stick thickness
    const P = [px, py, pz] as const;

    let U: [number, number, number] = [0, 0, 1];
    let V: [number, number, number] = [-dy, dx, 0];
    if (dx === 0) {
      U = [1, 0, 0];
      V = [0, -dz, dy];
    }

    const dotVec = (v: [number, number, number], s: number): [number, number, number] => [v[0] * s, v[1] * s, v[2] * s];
    const addVec = (v1: readonly [number, number, number], v2: readonly [number, number, number], v3: readonly [number, number, number]): [number, number, number] => [
      v1[0] + v2[0] + v3[0],
      v1[1] + v2[1] + v3[1],
      v1[2] + v2[2] + v3[2]
    ];

    const v0 = addVec(P, dotVec(U, -W), dotVec(V, -W));
    const v1 = addVec(P, dotVec(U, W), dotVec(V, -W));
    const v2 = addVec(P, dotVec(U, W), dotVec(V, W));
    const v3 = addVec(P, dotVec(U, -W), dotVec(V, W));

    const endP = addVec(P, dotVec([dx, dy, dz], L), [0, 0, 0]);
    const v4 = addVec(endP, dotVec(U, -W), dotVec(V, -W));
    const v5 = addVec(endP, dotVec(U, W), dotVec(V, -W));
    const v6 = addVec(endP, dotVec(U, W), dotVec(V, W));
    const v7 = addVec(endP, dotVec(U, -W), dotVec(V, W));

    const pushStickFace = (p0: [number, number, number], p1: [number, number, number], p2: [number, number, number], p3: [number, number, number], normal: [number, number, number], brightness = 1.0) => {
      if (!planksRect) return;
      buffers.pushQuad(
        [[x + p0[0], y + p0[1], z + p0[2]], [x + p1[0], y + p1[1], z + p1[2]], [x + p2[0], y + p2[1], z + p2[2]], [x + p3[0], y + p3[1], z + p3[2]]],
        normal,
        planksRect,
        tint,
        light,
        1,
        FluidTextureKind.WaterStill,
        [planksRect.u0, planksRect.v1, planksRect.u1, planksRect.v1, planksRect.u1, planksRect.v0, planksRect.u0, planksRect.v0],
        undefined,
        brightness
      );
    };

    pushStickFace(v4, v5, v6, v7, [dx, dy, dz], 1.0);
    pushStickFace(v3, v2, v1, v0, [-dx, -dy, -dz], 0.5);
    pushStickFace(v1, v5, v6, v2, U, 0.6);
    pushStickFace(v0, v3, v7, v4, [-U[0], -U[1], -U[2]], 0.6);
    pushStickFace(v2, v6, v7, v3, V, 0.8);
    pushStickFace(v0, v4, v5, v1, [-V[0], -V[1], -V[2]], 0.8);
  }

  private buildStandingSign(buffers: MeshBuffers, chunk: Chunk, x: number, y: number, z: number, blockId: BlockId, definition: BlockDefinition): void {
    const uvRect = this.getSafeUvRect('planks_oak');
    const tint = this.resolveVegetationTint(blockId, 'side', resolveBlockTint(definition, 'side'), chunk.chunkX * CHUNK_SIZE_X + x, chunk.chunkZ * CHUNK_SIZE_Z + z);
    const light = this.getMaxNeighborLight(chunk, x, y, z);

    const u0 = uvRect ? uvRect.u0 : 0;
    const v0 = uvRect ? uvRect.v0 : 0;
    const u1 = uvRect ? uvRect.u1 : 0;
    const v1 = uvRect ? uvRect.v1 : 0;

    const pushQuadDirect = (
      p0: [number, number, number], p1: [number, number, number], p2: [number, number, number], p3: [number, number, number],
      normal: [number, number, number], brightness = 1.0
    ) => {
      buffers.pushQuad(
        [p0, p1, p2, p3],
        normal,
        uvRect,
        tint,
        light,
        1,
        FluidTextureKind.WaterStill,
        [u0, v1, u1, v1, u1, v0, u0, v0],
        undefined,
        brightness
      );
    };

    const bw = 12/32, bh = 12/32, bd = 1/32;
    const by = 8/16;
    const meta = chunk.getBlockMetadata(x, y, z);
    const angle = (meta * 360 / 16) * Math.PI / 180;
    
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    
    const rot = (lx: number, lz: number): [number, number] => {
      return [0.5 + lx * cos - lz * sin, 0.5 + lx * sin + lz * cos];
    };

    // Post quads
    pushQuadDirect([x + 0.5 + 1/16, y, z + 0.5 - 1/16], [x + 0.5 + 1/16, y + by, z + 0.5 - 1/16], [x + 0.5 + 1/16, y + by, z + 0.5 + 1/16], [x + 0.5 + 1/16, y, z + 0.5 + 1/16], [1, 0, 0], 0.6);
    pushQuadDirect([x + 0.5 - 1/16, y, z + 0.5 + 1/16], [x + 0.5 - 1/16, y + by, z + 0.5 + 1/16], [x + 0.5 - 1/16, y + by, z + 0.5 - 1/16], [x + 0.5 - 1/16, y, z + 0.5 - 1/16], [-1, 0, 0], 0.6);
    pushQuadDirect([x + 0.5 - 1/16, y, z + 0.5 + 1/16], [x + 0.5 + 1/16, y, z + 0.5 + 1/16], [x + 0.5 + 1/16, y + by, z + 0.5 + 1/16], [x + 0.5 - 1/16, y + by, z + 0.5 + 1/16], [0, 0, 1], 0.8);
    pushQuadDirect([x + 0.5 + 1/16, y, z + 0.5 - 1/16], [x + 0.5 - 1/16, y, z + 0.5 - 1/16], [x + 0.5 - 1/16, y + by, z + 0.5 - 1/16], [x + 0.5 + 1/16, y + by, z + 0.5 - 1/16], [0, 0, -1], 0.8);

    // Board quads
    const [blx, blz] = rot(-bw, -bd);
    const [brx, brz] = rot(bw, -bd);
    const [tlx, tlz] = rot(-bw, bd);
    const [trx, trz] = rot(bw, bd);

    pushQuadDirect([x + trx, y + by, z + trz], [x + tlx, y + by, z + tlz], [x + tlx, y + by + bh, z + tlz], [x + trx, y + by + bh, z + trz], [-sin, 0, -cos], 0.8);
    pushQuadDirect([x + blx, y + by, z + blz], [x + brx, y + by, z + brz], [x + brx, y + by + bh, z + brz], [x + blx, y + by + bh, z + blz], [sin, 0, cos], 0.8);
    pushQuadDirect([x + brx, y + by, z + brz], [x + trx, y + by, z + trz], [x + trx, y + by + bh, z + brz], [x + brx, y + by + bh, z + brz], [cos, 0, -sin], 0.6);
    pushQuadDirect([x + tlx, y + by, z + tlz], [x + blx, y + by, z + blz], [x + blx, y + by + bh, z + blz], [x + tlx, y + by + bh, z + tlz], [-cos, 0, sin], 0.6);

    // Top and bottom edges of board
    pushQuadDirect([x + tlx, y + by + bh, z + tlz], [x + trx, y + by + bh, z + trz], [x + brx, y + by + bh, z + brz], [x + blx, y + by + bh, z + blz], [0, 1, 0], 1.0);
    pushQuadDirect([x + blx, y + by, z + blz], [x + brx, y + by, z + brz], [x + trx, y + by, z + trz], [x + tlx, y + by, z + tlz], [0, -1, 0], 0.5);
  }

  private buildWallSign(buffers: MeshBuffers, chunk: Chunk, x: number, y: number, z: number, blockId: BlockId, definition: BlockDefinition): void {
    const meta = chunk.getBlockMetadata(x, y, z);
    const textureName = resolveBlockTexture(definition, 'side') || 'oak_side';
    const uvRect = this.getSafeUvRect(textureName);
    const tint = this.resolveVegetationTint(blockId, 'side', resolveBlockTint(definition, 'side'), chunk.chunkX * CHUNK_SIZE_X + x, chunk.chunkZ * CHUNK_SIZE_Z + z);
    const light = this.getMaxNeighborLight(chunk, x, y, z);
    const l = [light.sky, light.sky, light.sky, light.sky] as Quad4;
    const b = [light.block, light.block, light.block, light.block] as Quad4;

    const pushQuadFromBounds = (dir: FaceDirection, p0: any, p1: any, p2: any, p3: any, normal: any) => {
      buffers.pushFace({ nx: normal[0], ny: normal[1], nz: normal[2], dx: normal[0], dy: normal[1], dz: normal[2], dir: dir, corners: [p0, p1, p2, p3] as any }, x, y, z, uvRect, tint, l, b);
    };

    const bw = 12/32, bh = 12/32, bd = 2/32;
    let minX = 0.5 - bw, maxX = 0.5 + bw;
    let minY = 0.5 - bh/2, maxY = 0.5 + bh/2;
    let minZ = 0.5 - bw, maxZ = 0.5 + bw;

    if (meta === 2) { minZ = 1 - bd; maxZ = 1; }
    else if (meta === 3) { minZ = 0; maxZ = bd; }
    else if (meta === 4) { minX = 1 - bd; maxX = 1; minZ = 0.5 - bw; maxZ = 0.5 + bw; }
    else if (meta === 5) { minX = 0; maxX = bd; minZ = 0.5 - bw; maxZ = 0.5 + bw; }

    pushQuadFromBounds(FaceDirection.EAST, [maxX, minY, minZ], [maxX, maxY, minZ], [maxX, maxY, maxZ], [maxX, minY, maxZ], [1, 0, 0]);
    pushQuadFromBounds(FaceDirection.WEST, [minX, minY, maxZ], [minX, maxY, maxZ], [minX, maxY, minZ], [minX, minY, minZ], [-1, 0, 0]);
    pushQuadFromBounds(FaceDirection.TOP, [minX, maxY, maxZ], [maxX, maxY, maxZ], [maxX, maxY, minZ], [minX, maxY, minZ], [0, 1, 0]);
    pushQuadFromBounds(FaceDirection.BOTTOM, [minX, minY, minZ], [maxX, minY, minZ], [maxX, minY, maxZ], [minX, minY, maxZ], [0, -1, 0]);
    pushQuadFromBounds(FaceDirection.SOUTH, [minX, minY, maxZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], [minX, maxY, maxZ], [0, 0, 1]);
    pushQuadFromBounds(FaceDirection.NORTH, [maxX, minY, minZ], [minX, minY, minZ], [minX, maxY, minZ], [maxX, maxY, minZ], [0, 0, -1]);
  }
}
