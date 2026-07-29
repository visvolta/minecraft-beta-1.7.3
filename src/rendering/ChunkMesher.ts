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
import { getSkyLight, getBlockLightLevel, getBlockLightRgb } from '../world/generation/lighting/LightValue';
import {
  AIR_BLOCK_ID,
  CHUNK_SECTION_COUNT,
  CHUNK_SECTION_HEIGHT,
  CHUNK_SIZE_X,
  CHUNK_SIZE_Y,
  CHUNK_SIZE_Z,
} from '../world/chunkConstants';
import { getWireConnections, WireConnection, getRedstoneColor } from '../world/redstone/RedstoneWireConnectivity';
import { isFallingFluid } from '../world/fluid/FluidMetadata';
import { packLightByte, packUnitByte } from './meshing/ChunkVertexLayout';
import { FluidTextureKind } from '../world/fluid/FluidTextureKind';
import { computeFluidFlowVector } from '../world/fluid/FluidFlowVector';
import { getBetaFluidCornerHeight } from './fluid/FluidSurfaceGeometry';
import { FLUID_RENDER_SETTINGS } from './fluid/FluidRenderSettings';
import { ChunkPassMask, classifyBlockPassMask, hasChunkPass } from './meshing/ChunkPassMask';
import { FloatBuilder, IndexBuilder, Uint8Builder, emptyLeafCullStats, type LeafCullStats } from './meshing/TypedMeshBuilder';
import { getRailShapeForBlock } from '../world/rails/RailShapes';
import { isDoorBlockId } from '../blocks/shapes/BlockShapes';
import {
  BED_HEIGHT,
  bedFlippedFace,
  bedHiddenFace,
  bedOutwardFace,
  doorShape,
  trapdoorShape,
  fenceSelectionShapes,
  stairShapes,
} from '../blocks/shapes/BlockShapes';

type Corner = readonly [number, number, number];
type Quad4 = readonly [number, number, number, number];
type Quad8 = readonly [number, number, number, number, number, number, number, number];

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
  /** Scalar block level = max(R,G,B); kept for AO/smoothing comparisons. */
  readonly block: number;
  /** Coloured block light channels (0..15 each). */
  readonly blockR: number;
  readonly blockG: number;
  readonly blockB: number;
}

/**
 * Reads one cell's light as a single packed word and decodes it through the
 * LightValue helpers, so meshing never open-codes the bit layout.
 */
function sampleFrom(chunk: Chunk, lx: number, ly: number, lz: number): LightSample {
  const packed = chunk.getPackedLight(lx, ly, lz);
  const rgb = getBlockLightRgb(packed);
  return {
    sky: getSkyLight(packed),
    block: getBlockLightLevel(packed),
    blockR: rgb.r,
    blockG: rgb.g,
    blockB: rgb.b,
  };
}

interface VertexSmoothLighting {
  readonly skyLevels: Quad4;
  /** Scalar block level per vertex, retained for comparisons/debug. */
  readonly blockLevels: Quad4;
  /** Per-vertex coloured block light. */
  readonly blockR: Quad4;
  readonly blockG: Quad4;
  readonly blockB: Quad4;
  readonly aoFactors: Quad4;
  readonly flipDiagonal: boolean;
}

interface SectionPassCache {
  readonly blockRevision: number;
  readonly passMasks: Uint8Array;
}

const AO_LEVEL_TO_FACTOR = [0.4, 0.6, 0.8, 1.0] as const;
const DEFAULT_VALUES: Quad4 = [1, 1, 1, 1];

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
  /**
   * Whether this buffer emits the fluid-only attributes.
   *
   * The layout is a property of the RENDER PASS, never of the data that
   * happens to be in it. A fluid pass that emits zero vertices must still
   * declare fluidTextureKind/fluidFrameUv, and a fluid pass that mixes
   * pushFace and pushQuad must write them for every vertex, or the geometry
   * ends up with attribute counts that disagree with `position`.
   */
  public readonly fluidLayout: boolean;

  public constructor(fluidLayout = false) {
    this.fluidLayout = fluidLayout;
  }

  public readonly positions = new FloatBuilder(4096);
  public readonly uvs = new FloatBuilder(4096);
  public readonly tintColors = new FloatBuilder(4096);
  /** Normalized uint8x4: sky, block, ao, faceBrightness. */
  public readonly packedLight = new Uint8Builder(4096);
  /**
   * AO and face brightness, displaced from packedLight so the four light bytes
   * can carry (sky, R, G, B).
   *
   * This is a SEPARATE Uint8 attribute of size 2. Three.js keeps attributes in
   * their own arrays rather than one interleaved struct, so this costs exactly
   * 2 bytes per vertex with no alignment padding.
   */
  public readonly surfaceShade = new Uint8Builder(2048);
  public readonly fluidTextureKinds = new FloatBuilder(1024);
  public readonly fluidFrameUvs = new FloatBuilder(2048);
  public readonly indices = new IndexBuilder(6144);
  public readonly leafStats: LeafCullStats = emptyLeafCullStats();

  public clear(): void {
    this.positions.clear();
    this.uvs.clear();
    this.tintColors.clear();
    this.packedLight.clear();
    this.surfaceShade.clear();
    this.fluidTextureKinds.clear();
    this.fluidFrameUvs.clear();
    this.indices.clear();
    this.leafStats.tested = 0;
    this.leafStats.culledOpaque = 0;
    this.leafStats.culledLeaves = 0;
    this.leafStats.emitted = 0;
  }

  public get vertexCount(): number {
    return this.positions.count / 3;
  }

  public pushFace(
    face: FaceDef,
    x: number,
    y: number,
    z: number,
    uvRect: { u0: number; v0: number; u1: number; v1: number } | undefined,
    tint: readonly [number, number, number],
    skyLevels: Quad4,
    blockLevels: Quad4,
    blockRLevels: Quad4,
    blockGLevels: Quad4,
    blockBLevels: Quad4,
    aoByVertex: Quad4 = DEFAULT_VALUES,
    flipDiagonal = false,
  ): void {
    const [tintR, tintG, tintB] = getLinearTint(tint);
    const vertexOffset = this.vertexCount;

    for (let i = 0; i < 4; i++) {
      const corner = face.corners[i]!;
      const [cx, cy, cz] = corner;
      const sky = skyLevels[i]!;
      void blockLevels;
      const blockR = blockRLevels[i]!;
      const blockG = blockGLevels[i]!;
      const blockB = blockBLevels[i]!;
      const ao = aoByVertex[i]!;

      this.positions.push3(x + cx, y + cy, z + cz);
      if (uvRect !== undefined) {
        const [localU, localV] = localCornerToTextureUv(face, corner);
        this.uvs.push2(
          uvRect.u0 + localU * (uvRect.u1 - uvRect.u0),
          uvRect.v0 + localV * (uvRect.v1 - uvRect.v0),
        );
      } else {
        this.uvs.push2(0, 0);
      }

      this.tintColors.push3(tintR, tintG, tintB);
      this.packedLight.push4(packLightByte(sky), packLightByte(blockR), packLightByte(blockG), packLightByte(blockB));
      this.surfaceShade.push2(packUnitByte(ao), packUnitByte(1));
      this.pushFluidPlaceholder();
    }

    if (flipDiagonal) {
      this.indices.push6(vertexOffset, vertexOffset + 1, vertexOffset + 3, vertexOffset + 1, vertexOffset + 2, vertexOffset + 3);
    } else {
      this.indices.push6(vertexOffset, vertexOffset + 1, vertexOffset + 2, vertexOffset, vertexOffset + 2, vertexOffset + 3);
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
    const u0 = uvRect ? uvRect.u0 : 0;
    const v0 = uvRect ? uvRect.v0 : 0;
    const u1 = uvRect ? uvRect.u1 : 0;
    const v1 = uvRect ? uvRect.v1 : 0;

    let offset = this.vertexCount;
    this.positions.push3(x, y, z);
    this.positions.push3(x + 1, y, z + 1);
    this.positions.push3(x + 1, y + 1, z + 1);
    this.positions.push3(x, y + 1, z);
    for (let i = 0; i < 4; i++) {
      this.tintColors.push3(tintR, tintG, tintB);
      this.packedLight.push4(packLightByte(light.sky), packLightByte(light.blockR), packLightByte(light.blockG), packLightByte(light.blockB));
      this.surfaceShade.push2(packUnitByte(1), packUnitByte(1));
      this.pushFluidPlaceholder();
    }
    this.uvs.push2(u0, v1);
    this.uvs.push2(u1, v1);
    this.uvs.push2(u1, v0);
    this.uvs.push2(u0, v0);
    this.indices.push6(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);

    offset = this.vertexCount;
    this.positions.push3(x, y, z + 1);
    this.positions.push3(x + 1, y, z);
    this.positions.push3(x + 1, y + 1, z);
    this.positions.push3(x, y + 1, z + 1);
    for (let i = 0; i < 4; i++) {
      this.tintColors.push3(tintR, tintG, tintB);
      this.packedLight.push4(packLightByte(light.sky), packLightByte(light.blockR), packLightByte(light.blockG), packLightByte(light.blockB));
      this.surfaceShade.push2(packUnitByte(1), packUnitByte(1));
      this.pushFluidPlaceholder();
    }
    this.uvs.push2(u0, v1);
    this.uvs.push2(u1, v1);
    this.uvs.push2(u1, v0);
    this.uvs.push2(u0, v0);
    this.indices.push6(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
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
    blockRLevels: Quad4,
    blockGLevels: Quad4,
    blockBLevels: Quad4,
    aoByVertex: Quad4 = DEFAULT_VALUES,
    flipDiagonal = false,
  ): void {
    // Delegate to legacy-compatible path via temporary FaceDef-like corners
    const face = FACES[faceIndex]!;
    // Cactus uses inset geometry — keep existing detailed path by calling simplified full-face for non-side?
    // Use original inset math with typed pushes:
    const [tintR, tintG, tintB] = getLinearTint(tint);
    const u0 = uvRect ? uvRect.u0 : 0;
    const v0 = uvRect ? uvRect.v0 : 0;
    const u1 = uvRect ? uvRect.u1 : 0;
    const v1 = uvRect ? uvRect.v1 : 0;
    const vertexOffset = this.vertexCount;
    const inset = 0.0625;
    const oinset = 1 - inset;
    let px: number[] = [];
    let py: number[] = [];
    let pz: number[] = [];
    let faceUvs: number[] = [];
    switch (faceIndex) {
      case 0:
        px = [x + oinset, x + oinset, x + oinset, x + oinset];
        py = [y, y + 1, y + 1, y];
        pz = [z + inset, z + inset, z + oinset, z + oinset];
        faceUvs = [u0 + (u1 - u0) * inset, v1, u0 + (u1 - u0) * inset, v0, u0 + (u1 - u0) * oinset, v0, u0 + (u1 - u0) * oinset, v1];
        break;
      case 1:
        px = [x + inset, x + inset, x + inset, x + inset];
        py = [y, y + 1, y + 1, y];
        pz = [z + oinset, z + oinset, z + inset, z + inset];
        faceUvs = [u0 + (u1 - u0) * oinset, v1, u0 + (u1 - u0) * oinset, v0, u0 + (u1 - u0) * inset, v0, u0 + (u1 - u0) * inset, v1];
        break;
      case 2:
        px = [x + inset, x + oinset, x + oinset, x + inset];
        py = [y + 1, y + 1, y + 1, y + 1];
        pz = [z + oinset, z + oinset, z + inset, z + inset];
        faceUvs = [u0 + (u1 - u0) * inset, v0 + (v1 - v0) * oinset, u0 + (u1 - u0) * oinset, v0 + (v1 - v0) * oinset, u0 + (u1 - u0) * oinset, v0 + (v1 - v0) * inset, u0 + (u1 - u0) * inset, v0 + (v1 - v0) * inset];
        break;
      case 3:
        px = [x + inset, x + oinset, x + oinset, x + inset];
        py = [y, y, y, y];
        pz = [z + inset, z + inset, z + oinset, z + oinset];
        faceUvs = [u0 + (u1 - u0) * inset, v0 + (v1 - v0) * inset, u0 + (u1 - u0) * oinset, v0 + (v1 - v0) * inset, u0 + (u1 - u0) * oinset, v0 + (v1 - v0) * oinset, u0 + (u1 - u0) * inset, v0 + (v1 - v0) * oinset];
        break;
      case 4:
        px = [x + inset, x + oinset, x + oinset, x + inset];
        py = [y, y, y + 1, y + 1];
        pz = [z + oinset, z + oinset, z + oinset, z + oinset];
        faceUvs = [u0 + (u1 - u0) * inset, v1, u0 + (u1 - u0) * oinset, v1, u0 + (u1 - u0) * oinset, v0, u0 + (u1 - u0) * inset, v0];
        break;
      default:
        px = [x + oinset, x + inset, x + inset, x + oinset];
        py = [y, y, y + 1, y + 1];
        pz = [z + inset, z + inset, z + inset, z + inset];
        faceUvs = [u0 + (u1 - u0) * oinset, v1, u0 + (u1 - u0) * inset, v1, u0 + (u1 - u0) * inset, v0, u0 + (u1 - u0) * oinset, v0];
        break;
    }
    for (let i = 0; i < 4; i++) {
      const sky = skyLevels[i]!;
      void blockLevels;
      const blockR = blockRLevels[i]!;
      const blockG = blockGLevels[i]!;
      const blockB = blockBLevels[i]!;
      const ao = aoByVertex[i]!;
      this.positions.push3(px[i]!, py[i]!, pz[i]!);
      this.uvs.push2(faceUvs[i * 2]!, faceUvs[i * 2 + 1]!);
      this.tintColors.push3(tintR, tintG, tintB);
      this.packedLight.push4(packLightByte(sky), packLightByte(blockR), packLightByte(blockG), packLightByte(blockB));
      this.surfaceShade.push2(packUnitByte(ao), packUnitByte(1));
      this.pushFluidPlaceholder();
    }
    if (flipDiagonal) {
      this.indices.push6(vertexOffset, vertexOffset + 1, vertexOffset + 3, vertexOffset + 1, vertexOffset + 2, vertexOffset + 3);
    } else {
      this.indices.push6(vertexOffset, vertexOffset + 1, vertexOffset + 2, vertexOffset, vertexOffset + 2, vertexOffset + 3);
    }
    void face;
  }

  public pushQuad(
    vertices: readonly [Corner, Corner, Corner, Corner],
    // Face normal is still supplied by callers for readability at the call
    // site, but is not emitted: chunk materials are unlit MeshBasicMaterial.
    _normal: readonly [number, number, number],
    uvRect: { u0: number; v0: number; u1: number; v1: number } | undefined,
    tint: readonly [number, number, number],
    light: LightSample,
    faceBrightness: number,
    fluidTextureKind: number,
    customUvs?: Quad8,
    customFrameUvs?: Quad8,
    ao = 1,
  ): void {
    const [tintR, tintG, tintB] = getLinearTint(tint);
    const vertexOffset = this.vertexCount;
    const u0 = uvRect?.u0 ?? 0;
    const v0 = uvRect?.v0 ?? 0;
    const u1 = uvRect?.u1 ?? 1;
    const v1 = uvRect?.v1 ?? 1;
    const uvs: readonly [number, number, number, number, number, number, number, number] = customUvs ?? [u0, v1, u1, v1, u1, v0, u0, v0];
    const frameUv = customFrameUvs ?? ([0, 1, 1, 1, 1, 0, 0, 0] as const);
    for (let i = 0; i < 4; i++) {
      const vertex = vertices[i]!;
      this.positions.push3(vertex[0], vertex[1], vertex[2]);
      this.uvs.push2(uvs[i * 2]!, uvs[i * 2 + 1]!);
      this.tintColors.push3(tintR, tintG, tintB);
      this.packedLight.push4(packLightByte(light.sky), packLightByte(light.blockR), packLightByte(light.blockG), packLightByte(light.blockB));
      this.surfaceShade.push2(packUnitByte(ao), packUnitByte(faceBrightness));
      if (this.fluidLayout) {
        this.fluidTextureKinds.push(fluidTextureKind);
        this.fluidFrameUvs.push2(frameUv[i * 2]!, frameUv[i * 2 + 1]!);
      }
    }
    this.indices.push6(vertexOffset, vertexOffset + 1, vertexOffset + 2, vertexOffset, vertexOffset + 2, vertexOffset + 3);
  }

  /**
   * Keeps the fluid attributes in lockstep with `position` on fluid passes
   * that also emit plain faces (fire mixes pushFace and pushQuad). No-op on
   * non-fluid passes, which never declare these attributes at all.
   */
  private pushFluidPlaceholder(): void {
    if (!this.fluidLayout) return;
    this.fluidTextureKinds.push(FluidTextureKind.WaterStill);
    this.fluidFrameUvs.push2(0, 0);
  }

  public toGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const pos = new Float32Array(this.positions.view());
    const uv = new Float32Array(this.uvs.view());
    const tc = new Float32Array(this.tintColors.view());
    const pl = new Uint8Array(this.packedLight.view());
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setAttribute('tintColor', new THREE.Float32BufferAttribute(tc, 3));
    // Normalized so the GPU reads sky/block RGB as 0..1; ao/faceBrightness
    // travel in the separate surfaceShade attribute (see below).
    // xyzw = skylight, blockR, blockG, blockB (each normalized 0..15 -> 0..1).
    geometry.setAttribute('packedLight', new THREE.Uint8BufferAttribute(pl, 4, true));
    const ss = new Uint8Array(this.surfaceShade.view());
    geometry.setAttribute('surfaceShade', new THREE.Uint8BufferAttribute(ss, 2, true));
    if (this.fluidLayout) {
      const fk = new Float32Array(this.fluidTextureKinds.view());
      const ff = new Float32Array(this.fluidFrameUvs.view());
      geometry.setAttribute('fluidTextureKind', new THREE.Float32BufferAttribute(fk, 1));
      geometry.setAttribute('fluidFrameUv', new THREE.Float32BufferAttribute(ff, 2));
    }
    const { buffer, indexType } = this.indices.toArrayBuffer(this.vertexCount <= 65535);
    geometry.setIndex(new THREE.BufferAttribute(
      indexType === 'uint16' ? new Uint16Array(buffer) : new Uint32Array(buffer),
      1,
    ));
    return geometry;
  }

  /** Transferable attribute pack for workers — each buffer is an owned copy ready to transfer. */
  public toAttributeBuffers(): {
    positions: ArrayBuffer;
    uvs: ArrayBuffer;
    tintColors: ArrayBuffer;
    packedLight: ArrayBuffer;
    fluidTextureKinds: ArrayBuffer;
    fluidFrameUvs: ArrayBuffer;
    indices: ArrayBuffer;
    indexType: 'uint16' | 'uint32';
    vertexCount: number;
    indexCount: number;
  } {
    const vertexCount = this.vertexCount;
    const indexCount = this.indices.count;
    if (vertexCount === 0 || indexCount === 0) {
      return {
        positions: new ArrayBuffer(0),
        uvs: new ArrayBuffer(0),
        tintColors: new ArrayBuffer(0),
        packedLight: new ArrayBuffer(0),
        fluidTextureKinds: new ArrayBuffer(0),
        fluidFrameUvs: new ArrayBuffer(0),
        indices: new ArrayBuffer(0),
        indexType: 'uint32',
        vertexCount: 0,
        indexCount: 0,
      };
    }
    const idx = this.indices.toArrayBuffer(vertexCount <= 65535);
    return {
      positions: this.positions.toArrayBuffer(),
      uvs: this.uvs.toArrayBuffer(),
      tintColors: this.tintColors.toArrayBuffer(),
      packedLight: this.packedLight.toArrayBuffer(),
      fluidTextureKinds: this.fluidTextureKinds.toArrayBuffer(),
      fluidFrameUvs: this.fluidFrameUvs.toArrayBuffer(),
      indices: idx.buffer,
      indexType: idx.indexType,
      vertexCount,
      indexCount,
    };
  }
}


export class ChunkMesher {
  public lastLeafCullStats: LeafCullStats = emptyLeafCullStats();
  public beginBuild(): void {
    this.vegetationColors?.beginMeshBuild();
  }
  private readonly chunkManager: ChunkManager;
  private readonly blockRegistry: BlockRegistry;
  private readonly atlas: TextureAtlas;
  private readonly vegetationColors: VegetationColorProvider | undefined;
  private readonly sectionPassCache = new WeakMap<Chunk, SectionPassCache>();

  public constructor(chunkManager: ChunkManager, blockRegistry: BlockRegistry, atlas: TextureAtlas, vegetationColors?: VegetationColorProvider) {
    this.chunkManager = chunkManager; this.blockRegistry = blockRegistry; this.atlas = atlas; this.vegetationColors = vegetationColors;
  }

  private getSectionPassMasks(chunk: Chunk): Uint8Array {
    const cached = this.sectionPassCache.get(chunk);
    if (cached !== undefined && cached.blockRevision === chunk.getBlockRevision()) {
      return cached.passMasks;
    }
    const masks = new Uint8Array(CHUNK_SECTION_COUNT);
    const blocks = chunk.getBlockDataView();
    // MUST include every pass bit: this is an early-exit sentinel, and any
    // omitted pass can be missed entirely when the loop breaks before
    // reaching one of its blocks (portals were skipped this way).
    const fullMask = ChunkPassMask.Terrain | ChunkPassMask.Water | ChunkPassMask.Lava
      | ChunkPassMask.Cutout | ChunkPassMask.Fire | ChunkPassMask.Translucent
      | ChunkPassMask.Leaves | ChunkPassMask.Portal;
    for (let sectionIndex = 0; sectionIndex < CHUNK_SECTION_COUNT; sectionIndex++) {
      if (chunk.isSectionEmpty(sectionIndex)) continue;
      const startY = sectionIndex * CHUNK_SECTION_HEIGHT;
      const startIndex = startY * CHUNK_SIZE_X * CHUNK_SIZE_Z;
      const endIndex = startIndex + CHUNK_SECTION_HEIGHT * CHUNK_SIZE_X * CHUNK_SIZE_Z;
      let mask = ChunkPassMask.None;
      for (let index = startIndex; index < endIndex; index++) {
        mask |= classifyBlockPassMask(blocks[index] as BlockId, this.blockRegistry);
        if (mask === fullMask) break;
      }
      masks[sectionIndex] = mask;
    }
    this.sectionPassCache.set(chunk, { blockRevision: chunk.getBlockRevision(), passMasks: masks });
    return masks;
  }

  private sectionYRange(sectionIndex: number): { startY: number; endY: number } {
    const startY = sectionIndex * CHUNK_SECTION_HEIGHT;
    return { startY, endY: Math.min(CHUNK_SIZE_Y, startY + CHUNK_SECTION_HEIGHT) };
  }

  private resolveVegetationTint(blockId: BlockId, face: BlockFace, fallback: readonly [number, number, number], worldX: number, worldZ: number, metadata = 0): readonly [number, number, number] {
    const kind = vegetationTintKind(blockId, face, metadata);
    if (kind === undefined || this.vegetationColors === undefined) return fallback;
    if (kind === 'untinted') return [1, 1, 1];
    return this.vegetationColors.getColorAt(kind, worldX, worldZ);
  }

  private getLightComponentsAt(chunk: Chunk, lx: number, ly: number, lz: number): LightSample {
    if (ly < 0) {
      return { sky: 0, block: 0, blockR: 0, blockG: 0, blockB: 0 };
    }
    if (ly >= CHUNK_SIZE_Y) {
      return { sky: 15, block: 0, blockR: 0, blockG: 0, blockB: 0 };
    }

    if (chunk.isInBounds(lx, ly, lz)) {
      return sampleFrom(chunk, lx, ly, lz);
    }

    const neighbour = this.getChunkAndLocal(chunk, lx, lz);
    if (neighbour === undefined) {
      return { sky: ly >= 64 ? 15 : 0, block: 0, blockR: 0, blockG: 0, blockB: 0 };
    }

    return sampleFrom(neighbour.chunk, neighbour.localX, ly, neighbour.localZ);
  }

  private getMaxNeighborLight(chunk: Chunk, x: number, y: number, z: number): LightSample {
    const selfLight = this.getLightComponentsAt(chunk, x, y, z);
    const east = this.getLightComponentsAt(chunk, x + 1, y, z);
    const west = this.getLightComponentsAt(chunk, x - 1, y, z);
    const south = this.getLightComponentsAt(chunk, x, y, z + 1);
    const north = this.getLightComponentsAt(chunk, x, y, z - 1);
    const up = this.getLightComponentsAt(chunk, x, y + 1, z);
    
    // Per-channel maxima: an adjacent red source and an adjacent warm source
    // must both contribute rather than the brighter one erasing the other.
    return {
      sky: Math.max(selfLight.sky, east.sky, west.sky, south.sky, north.sky, up.sky),
      block: Math.max(selfLight.block, east.block, west.block, south.block, north.block, up.block),
      blockR: Math.max(selfLight.blockR, east.blockR, west.blockR, south.blockR, north.blockR, up.blockR),
      blockG: Math.max(selfLight.blockG, east.blockG, west.blockG, south.blockG, north.blockG, up.blockG),
      blockB: Math.max(selfLight.blockB, east.blockB, west.blockB, south.blockB, north.blockB, up.blockB),
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

  // retained for reference / parity debugging
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
        blockR: [light.blockR, light.blockR, light.blockR, light.blockR],
        blockG: [light.blockG, light.blockG, light.blockG, light.blockG],
        blockB: [light.blockB, light.blockB, light.blockB, light.blockB],
        aoFactors: DEFAULT_VALUES,
        flipDiagonal: false,
      };
    }

    // Cache a 3×3 of light samples on the face plane covering all corner 2×2 windows.
    // Index: (u+1) + (v+1)*3 where u,v in -1..1 along the two face axes.
    const plane: LightSample[] = new Array(9);
    if (face.dx !== 0) {
      const planeX = x + face.dx;
      for (let dv = -1; dv <= 1; dv++) {
        for (let du = -1; du <= 1; du++) {
          // u along Y, v along Z
          plane[(du + 1) + (dv + 1) * 3] = this.getLightComponentsAt(chunk, planeX, y + du, z + dv);
        }
      }
    } else if (face.dy !== 0) {
      const planeY = y + face.dy;
      for (let dv = -1; dv <= 1; dv++) {
        for (let du = -1; du <= 1; du++) {
          // u along X, v along Z
          plane[(du + 1) + (dv + 1) * 3] = this.getLightComponentsAt(chunk, x + du, planeY, z + dv);
        }
      }
    } else {
      const planeZ = z + face.dz;
      for (let dv = -1; dv <= 1; dv++) {
        for (let du = -1; du <= 1; du++) {
          // u along X, v along Y
          plane[(du + 1) + (dv + 1) * 3] = this.getLightComponentsAt(chunk, x + du, y + dv, planeZ);
        }
      }
    }

    const at = (du: number, dv: number): LightSample => plane[(du + 1) + (dv + 1) * 3]!;
    const cornerFromSteps = (su: number, sv: number): LightSample => {
      // su,sv are -1 or +1 from the face center toward the corner in plane axes
      const a = at(0, 0);
      const b = at(su, 0);
      const c = at(0, sv);
      const d = at(su, sv);
      return {
        sky: (a.sky + b.sky + c.sky + d.sky) / 4,
        block: (a.block + b.block + c.block + d.block) / 4,
        blockR: (a.blockR + b.blockR + c.blockR + d.blockR) / 4,
        blockG: (a.blockG + b.blockG + c.blockG + d.blockG) / 4,
        blockB: (a.blockB + b.blockB + c.blockB + d.blockB) / 4,
      };
    };

    // Map each face corner's local 0/1 into plane steps -1/+1 matching sampleCornerLightComponents.
    const lights: LightSample[] = [];
    const aos: number[] = [];
    for (let i = 0; i < 4; i++) {
      const corner = face.corners[i]!;
      let su: number;
      let sv: number;
      if (face.dx !== 0) {
        su = corner[1] === 0 ? -1 : 1; // Y
        sv = corner[2] === 0 ? -1 : 1; // Z
      } else if (face.dy !== 0) {
        su = corner[0] === 0 ? -1 : 1; // X
        sv = corner[2] === 0 ? -1 : 1; // Z
      } else {
        su = corner[0] === 0 ? -1 : 1; // X
        sv = corner[1] === 0 ? -1 : 1; // Y
      }
      lights.push(cornerFromSteps(su, sv));
      aos.push(this.sampleCornerAoFactor(chunk, x, y, z, face, corner));
    }

    const ao0 = aos[0]!;
    const ao1 = aos[1]!;
    const ao2 = aos[2]!;
    const ao3 = aos[3]!;
    return {
      skyLevels: [lights[0]!.sky, lights[1]!.sky, lights[2]!.sky, lights[3]!.sky],
      blockLevels: [lights[0]!.block, lights[1]!.block, lights[2]!.block, lights[3]!.block],
      blockR: [lights[0]!.blockR, lights[1]!.blockR, lights[2]!.blockR, lights[3]!.blockR],
      blockG: [lights[0]!.blockG, lights[1]!.blockG, lights[2]!.blockG, lights[3]!.blockG],
      blockB: [lights[0]!.blockB, lights[1]!.blockB, lights[2]!.blockB, lights[3]!.blockB],
      aoFactors: [ao0, ao1, ao2, ao3],
      flipDiagonal: ao0 + ao2 > ao1 + ao3,
    };
  }


  public lastVoxelVisits = 0;

  /**
   * Single voxel traversal → modular pass builders (no greedy meshing).
   * Visits each non-empty section once; classifies each block once; emits only
   * into the builders that need that block.
   */

  private emitTerrainBlock(
    chunk: Chunk,
    buffers: MeshBuffers,
    x: number,
    y: number,
    z: number,
    blockId: BlockId,
    definition: BlockDefinition,
  ): void {
    if (!this.isOpaqueMeshBlock(blockId)) return;
    for (const face of FACES) {
      const neighbourId = this.getBlockAt(chunk, x + face.dx, y + face.dy, z + face.dz);
      if (this.hidesOpaqueFace(neighbourId)) continue;
      let textureName = resolveBlockTexture(definition, face.slot!);
      if (blockId === BlockIds.DoubleSlab) {
        const metadata = chunk.getBlockMetadata(x, y, z);
        textureName = resolveSlabTexture(
          face.slot! === 'front' || face.slot! === 'back' ? 'side' : face.slot!,
          metadata,
        );
      }
      if (blockId === BlockIds.Grass && face.slot! === 'side') {
        const above = this.getBlockAt(chunk, x, y + 1, z);
        if (above === BlockIds.Snow || above === BlockIds.SnowBlock) textureName = 'grass_side_snowed';
      }
      const uvRect = this.getSafeUvRect(textureName);
      const tint = this.resolveVegetationTint(
        blockId,
        face.slot!,
        resolveBlockTint(definition, face.slot!),
        chunk.chunkX * CHUNK_SIZE_X + x,
        chunk.chunkZ * CHUNK_SIZE_Z + z,
      );
      const smoothLighting = this.getSmoothLighting(chunk, x, y, z, blockId, face);
      buffers.pushFace(
        face, x, y, z, uvRect, tint,
        smoothLighting.skyLevels, smoothLighting.blockLevels, smoothLighting.blockR, smoothLighting.blockG, smoothLighting.blockB,
        smoothLighting.aoFactors, smoothLighting.flipDiagonal,
      );
    }
  }

  private emitLeavesBlock(
    chunk: Chunk,
    buffers: MeshBuffers,
    x: number,
    y: number,
    z: number,
    blockId: BlockId,
    definition: BlockDefinition,
  ): void {
    for (const face of FACES) {
      const neighbourId = this.getBlockAt(chunk, x + face.dx, y + face.dy, z + face.dz);
      buffers.leafStats.tested += 1;
      const hide = this.hidesLeafFace(neighbourId, face);
      if (hide === 'opaque') {
        buffers.leafStats.culledOpaque += 1;
        continue;
      }
      buffers.leafStats.emitted += 1;
      const textureName = resolveBlockTexture(definition, face.slot!);
      const uvRect = textureName !== undefined ? this.atlas.getUvRect(textureName) : undefined;
      const tint = this.resolveVegetationTint(
        blockId, face.slot!, resolveBlockTint(definition, face.slot!),
        chunk.chunkX * CHUNK_SIZE_X + x, chunk.chunkZ * CHUNK_SIZE_Z + z,
      );
      const smoothLighting = this.getSmoothLighting(chunk, x, y, z, blockId, face);
      buffers.pushFace(
        face, x, y, z, uvRect, tint,
        smoothLighting.skyLevels, smoothLighting.blockLevels, smoothLighting.blockR, smoothLighting.blockG, smoothLighting.blockB,
        smoothLighting.aoFactors, smoothLighting.flipDiagonal,
      );
    }
  }

  private emitCutoutBlock(
    chunk: Chunk,
    buffers: MeshBuffers,
    x: number,
    y: number,
    z: number,
    blockId: BlockId,
    definition: BlockDefinition,
  ): void {
    const renderType = definition.renderType;
    if (renderType === undefined || renderType === 'leaves') return;
    if (renderType === 'cutout') {
      if (blockId === BlockIds.RedstoneTorchOff || blockId === BlockIds.RedstoneTorchOn || blockId === BlockIds.Torch) {
        this.buildTorch(buffers, chunk, x, y, z, blockId, definition); return;
      }
      if (blockId === BlockIds.Slab) { this.buildSlab(buffers, chunk, x, y, z, blockId, definition); return; }
      if (isDoorBlockId(blockId)) { this.buildDoor(buffers, chunk, x, y, z, blockId, definition); return; }
      if (blockId === BlockIds.Trapdoor) { this.buildTrapdoor(buffers, chunk, x, y, z, blockId, definition); return; }
      if (blockId === BlockIds.WoodStairs || blockId === BlockIds.CobblestoneStairs) {
        this.buildStairs(buffers, chunk, x, y, z, definition); return;
      }
      if (blockId === BlockIds.Fence) { this.buildFence(buffers, chunk, x, y, z, definition); return; }
      if (blockId === BlockIds.Rail || blockId === BlockIds.PoweredRail || blockId === BlockIds.DetectorRail) {
        this.buildRail(buffers, chunk, x, y, z, blockId); return;
      }
      if (blockId === BlockIds.StonePressurePlate || blockId === BlockIds.WoodPressurePlate) {
        this.buildPressurePlate(buffers, chunk, x, y, z, blockId, definition); return;
      }
      if (blockId === BlockIds.StoneButton) { this.buildButton(buffers, chunk, x, y, z, blockId, definition); return; }
      if (blockId === BlockIds.Lever) { this.buildLever(buffers, chunk, x, y, z, blockId, definition); return; }
      if (blockId === BlockIds.SignPost) { this.buildStandingSign(buffers, chunk, x, y, z, blockId, definition); return; }
      if (blockId === BlockIds.WallSign) { this.buildWallSign(buffers, chunk, x, y, z, blockId, definition); return; }
      if (blockId === BlockIds.Bed) { this.buildBed(buffers, chunk, x, y, z, definition); return; }
      if (blockId === BlockIds.Ladder) {
        const textureName = resolveBlockTexture(definition, 'side') ?? 'ladder';
        let uvRect = this.atlas.getUvRect(textureName);
        if (uvRect === undefined) uvRect = this.atlas.getUvRect('missing_texture');
        const tint = this.resolveVegetationTint(blockId, 'side', resolveBlockTint(definition, 'side'), chunk.chunkX * CHUNK_SIZE_X + x, chunk.chunkZ * CHUNK_SIZE_Z + z);
        const light = this.getMaxNeighborLight(chunk, x, y, z);
        const metadata = chunk.getBlockMetadata(x, y, z);
        buffers.pushLadder(x, y, z, metadata, uvRect, tint, light);
        return;
      }
      for (const face of FACES) {
        const neighbourId = this.getBlockAt(chunk, x + face.dx, y + face.dy, z + face.dz);
        if (this.hidesCutoutFace(neighbourId)) continue;
        const textureName = resolveBlockTexture(definition, face.slot!);
        const uvRect = this.getSafeUvRect(textureName);
        const tint = this.resolveVegetationTint(blockId, face.slot!, resolveBlockTint(definition, face.slot!), chunk.chunkX * CHUNK_SIZE_X + x, chunk.chunkZ * CHUNK_SIZE_Z + z);
        const light = this.getLightComponentsAt(chunk, x + face.dx, y + face.dy, z + face.dz);
        buffers.pushFace(face, x, y, z, uvRect, tint, [light.sky, light.sky, light.sky, light.sky], [light.block, light.block, light.block, light.block], [light.blockR, light.blockR, light.blockR, light.blockR], [light.blockG, light.blockG, light.blockG, light.blockG], [light.blockB, light.blockB, light.blockB, light.blockB]);
      }
      return;
    }
    if (renderType === 'redstone_wire') {
      this.buildRedstoneWire(buffers, chunk, x, y, z, blockId, definition);
      return;
    }
    if (renderType === 'cross' && blockId !== BlockIds.Fire) {
      const crossMeta = chunk.getBlockMetadata(x, y, z);
      let textureName = resolveBlockTexture(definition, 'side');
      if (blockId === BlockIds.TallGrass && (crossMeta & 0xf) === 2) textureName = 'fern';
      else if (blockId === BlockIds.TallGrass) textureName = textureName ?? 'tall_grass';
      const uvRect = this.getSafeUvRect(textureName);
      const tint = this.resolveVegetationTint(blockId, 'side', resolveBlockTint(definition, 'side'), chunk.chunkX * CHUNK_SIZE_X + x, chunk.chunkZ * CHUNK_SIZE_Z + z, crossMeta);
      const light = this.getLightComponentsAt(chunk, x, y, z);
      buffers.pushCross(x, y, z, uvRect, tint, light);
      return;
    }
    if (renderType === 'cactus') {
      for (let i = 0; i < 6; i++) {
        const face = FACES[i]!;
        const neighbourId = this.getBlockAt(chunk, x + face.dx, y + face.dy, z + face.dz);
        if (this.hidesCactusFace(i, neighbourId)) continue;
        const slot = i === 2 ? 'top' : i === 3 ? 'bottom' : 'side';
        const textureName = resolveBlockTexture(definition, slot);
        const uvRect = this.getSafeUvRect(textureName);
        const tint = resolveBlockTint(definition, slot);
        const smoothLighting = this.getSmoothLighting(chunk, x, y, z, blockId, face);
        buffers.pushCactusFace(i, x, y, z, uvRect, tint, smoothLighting.skyLevels, smoothLighting.blockLevels, smoothLighting.blockR, smoothLighting.blockG, smoothLighting.blockB, smoothLighting.aoFactors, smoothLighting.flipDiagonal);
      }
      return;
    }
    if (renderType === 'snow') {
      const textureName = resolveBlockTexture(definition, 'side');
      const uvRect = this.getSafeUvRect(textureName);
      const tint = this.resolveVegetationTint(blockId, 'side', resolveBlockTint(definition, 'side'), chunk.chunkX * CHUNK_SIZE_X + x, chunk.chunkZ * CHUNK_SIZE_Z + z);
      const light = this.getLightComponentsAt(chunk, x, y, z);
      this.pushSnowBlock(buffers, x, y, z, uvRect, tint, light);
    }
  }

  private emitFireBlock(
    chunk: Chunk,
    buffers: MeshBuffers,
    x: number,
    y: number,
    z: number,
    blockId: BlockId,
    _definition: BlockDefinition,
  ): void {
    if (blockId !== BlockIds.Fire) return;
    // Reuse full fire builder for one cell by temporary isolation is heavy;
    // call existing multi-block path via building only this fire: use buildFires logic inline by scanning one block.
    // Simplest parity: run buildFires on chunk is wrong. Port ground/wall fire for one cell:
    const light = this.getLightComponentsAt(chunk, x, y, z);
    const lightSample: LightSample = light;
    const below = this.getBlockAt(chunk, x, y - 1, z);
    const isGroundFire = this.isBlockNormalCube(below) || this.canBlockCatchFire(below);
    const flipUvs = ((Math.floor(x / 2) + Math.floor(y / 2) + Math.floor(z / 2)) & 1) === 1;
    const uL = flipUvs ? 1 : 0;
    const uR = flipUvs ? 0 : 1;
    const V0 = 0;
    const V1 = 1;
    const H = 1.4;
    const Y_OFF = 0.0625;
    if (!isGroundFire) {
      if (this.canBlockCatchFire(this.getBlockAt(chunk, x - 1, y, z))) {
        buffers.pushQuad([[x + 0.2, y + H + Y_OFF, z + 1], [x, y + Y_OFF, z + 1], [x, y + Y_OFF, z], [x + 0.2, y + H + Y_OFF, z]], [1, 0, 0], undefined, [1, 1, 1], lightSample, 1, FluidTextureKind.WaterStill, undefined, [uR, V0, uR, V1, uL, V1, uL, V0]);
      }
      if (this.canBlockCatchFire(this.getBlockAt(chunk, x + 1, y, z))) {
        buffers.pushQuad([[x + 0.8, y + H + Y_OFF, z], [x + 1, y + Y_OFF, z], [x + 1, y + Y_OFF, z + 1], [x + 0.8, y + H + Y_OFF, z + 1]], [-1, 0, 0], undefined, [1, 1, 1], lightSample, 1, FluidTextureKind.WaterStill, undefined, [uL, V0, uL, V1, uR, V1, uR, V0]);
      }
      if (this.canBlockCatchFire(this.getBlockAt(chunk, x, y, z - 1))) {
        buffers.pushQuad([[x, y + H + Y_OFF, z + 0.2], [x, y + Y_OFF, z], [x + 1, y + Y_OFF, z], [x + 1, y + H + Y_OFF, z + 0.2]], [0, 0, 1], undefined, [1, 1, 1], lightSample, 1, FluidTextureKind.WaterStill, undefined, [uR, V0, uR, V1, uL, V1, uL, V0]);
      }
      if (this.canBlockCatchFire(this.getBlockAt(chunk, x, y, z + 1))) {
        buffers.pushQuad([[x + 1, y + H + Y_OFF, z + 0.8], [x + 1, y + Y_OFF, z + 1], [x, y + Y_OFF, z + 1], [x, y + H + Y_OFF, z + 0.8]], [0, 0, -1], undefined, [1, 1, 1], lightSample, 1, FluidTextureKind.WaterStill, undefined, [uL, V0, uL, V1, uR, V1, uR, V0]);
      }
    } else {
      buffers.pushQuad([[x + 1, y + H + Y_OFF, z + 1], [x + 1, y, z + 1], [x + 1, y, z], [x + 1, y + H + Y_OFF, z]], [1, 0, 0], undefined, [1, 1, 1], lightSample, 1, FluidTextureKind.WaterStill, undefined, [uR, V0, uR, V1, uL, V1, uL, V0]);
      buffers.pushQuad([[x + 0.0, y + H + Y_OFF, z + 1], [x + 0.0, y, z + 1], [x + 0.0, y, z], [x + 0.0, y + H + Y_OFF, z]], [-1, 0, 0], undefined, [1, 1, 1], lightSample, 1, FluidTextureKind.WaterStill, undefined, [uL, V0, uL, V1, uR, V1, uR, V0]);
      buffers.pushQuad([[x, y + H + Y_OFF, z + 0], [x, y, z + 0], [x + 1, y, z + 0], [x + 1, y + H + Y_OFF, z + 0]], [0, 0, 1], undefined, [1, 1, 1], lightSample, 1, FluidTextureKind.WaterStill, undefined, [uR, V0, uR, V1, uL, V1, uL, V0]);
      buffers.pushQuad([[x + 1, y + H + Y_OFF, z + 1], [x + 1, y, z + 1], [x, y, z + 1], [x, y + H + Y_OFF, z + 1]], [0, 0, -1], undefined, [1, 1, 1], lightSample, 1, FluidTextureKind.WaterStill, undefined, [uL, V0, uL, V1, uR, V1, uR, V0]);
    }
  }

  private emitTranslucentBlock(
    chunk: Chunk,
    buffers: MeshBuffers,
    x: number,
    y: number,
    z: number,
    blockId: BlockId,
    definition: BlockDefinition,
  ): void {
    // Ice and glass-like: use opaque-style faces with translucent pass rules
    for (const face of FACES) {
      const neighbourId = this.getBlockAt(chunk, x + face.dx, y + face.dy, z + face.dz);
      if (neighbourId === blockId) continue;
      if (this.hidesOpaqueFace(neighbourId)) continue;
      const textureName = resolveBlockTexture(definition, face.slot!);
      const uvRect = this.getSafeUvRect(textureName);
      const tint = this.resolveVegetationTint(blockId, face.slot!, resolveBlockTint(definition, face.slot!), chunk.chunkX * CHUNK_SIZE_X + x, chunk.chunkZ * CHUNK_SIZE_Z + z);
      const light = this.getLightComponentsAt(chunk, x + face.dx, y + face.dy, z + face.dz);
      buffers.pushFace(face, x, y, z, uvRect, tint, [light.sky, light.sky, light.sky, light.sky], [light.block, light.block, light.block, light.block], [light.blockR, light.blockR, light.blockR, light.blockR], [light.blockG, light.blockG, light.blockG, light.blockG], [light.blockB, light.blockB, light.blockB, light.blockB]);
    }
  }

  private emitWaterBlock(
    chunk: Chunk,
    buffers: MeshBuffers,
    x: number,
    y: number,
    z: number,
    blockId: BlockId,
    definition: BlockDefinition,
  ): void {
    if (!this.isWater(blockId)) return;
    this.buildFluidBlock(buffers, chunk, x, y, z, blockId, definition);
  }

  private emitLavaBlock(
    chunk: Chunk,
    buffers: MeshBuffers,
    x: number,
    y: number,
    z: number,
    blockId: BlockId,
    definition: BlockDefinition,
  ): void {
    if (!this.isLava(blockId)) return;
    this.buildFluidBlock(buffers, chunk, x, y, z, blockId, definition);
  }


  public buildAllPasses(chunk: Chunk): {
    terrain: THREE.BufferGeometry;
    cutout: THREE.BufferGeometry;
    leaves: THREE.BufferGeometry;
    fire: THREE.BufferGeometry;
    translucent: THREE.BufferGeometry;
    water: THREE.BufferGeometry;
    lava: THREE.BufferGeometry;
    portal: THREE.BufferGeometry;
  } {
    this.vegetationColors?.beginMeshBuild();
    this.lastVoxelVisits = 0;
    const terrain = new MeshBuffers();
    const cutout = new MeshBuffers();
    const leaves = new MeshBuffers();
    const fire = new MeshBuffers(true);
    const translucent = new MeshBuffers();
    const water = new MeshBuffers(true);
    const lava = new MeshBuffers(true);
    const portal = new MeshBuffers();

    for (let sectionIndex = 0; sectionIndex < CHUNK_SECTION_COUNT; sectionIndex++) {
      if (chunk.isSectionEmpty(sectionIndex)) continue;
      const { startY, endY } = this.sectionYRange(sectionIndex);
      for (let y = startY; y < endY; y++) {
        for (let z = 0; z < CHUNK_SIZE_Z; z++) {
          for (let x = 0; x < CHUNK_SIZE_X; x++) {
            const blockId = chunk.getBlock(x, y, z);
            if (blockId === AIR_BLOCK_ID) continue;
            this.lastVoxelVisits += 1;
            const definition = this.blockRegistry.getById(blockId);
            if (definition === undefined) continue;
            const pass = classifyBlockPassMask(blockId, this.blockRegistry);
            if (pass === ChunkPassMask.None) continue;

            if ((pass & ChunkPassMask.Terrain) !== 0) {
              this.emitTerrainBlock(chunk, terrain, x, y, z, blockId, definition);
            }
            if ((pass & ChunkPassMask.Cutout) !== 0) {
              this.emitCutoutBlock(chunk, cutout, x, y, z, blockId, definition);
            }
            if ((pass & ChunkPassMask.Leaves) !== 0) {
              this.emitLeavesBlock(chunk, leaves, x, y, z, blockId, definition);
            }
            if ((pass & ChunkPassMask.Fire) !== 0) {
              this.emitFireBlock(chunk, fire, x, y, z, blockId, definition);
            }
            if ((pass & ChunkPassMask.Translucent) !== 0) {
              this.emitTranslucentBlock(chunk, translucent, x, y, z, blockId, definition);
            }
            if ((pass & ChunkPassMask.Water) !== 0) {
              this.emitWaterBlock(chunk, water, x, y, z, blockId, definition);
            }
            if ((pass & ChunkPassMask.Lava) !== 0) {
              this.emitLavaBlock(chunk, lava, x, y, z, blockId, definition);
            }
            if ((pass & ChunkPassMask.Portal) !== 0) {
              this.emitPortalBlock(chunk, portal, x, y, z);
            }
          }
        }
      }
    }

    this.lastLeafCullStats = { ...leaves.leafStats };
    return {
      terrain: terrain.toGeometry(),
      cutout: cutout.toGeometry(),
      leaves: leaves.toGeometry(),
      fire: fire.toGeometry(),
      translucent: translucent.toGeometry(),
      water: water.toGeometry(),
      lava: lava.toGeometry(),
      portal: portal.toGeometry(),
    };
  }

  /**
   * Emits one portal block's thin oriented plane pair. Shared by the
   * single-pass worker traversal and the standalone buildPortals() path so
   * both produce identical geometry.
   */
  private emitPortalBlock(chunk: Chunk, buffers: MeshBuffers, x: number, y: number, z: number): void {
    const light = this.getLightComponentsAt(chunk, x, y, z);
    const tint: readonly [number, number, number] = [1, 1, 1];
    const inset = 0.125;

    // The portal is NOT sampled from the block atlas: the atlas keeps only the
    // top 16x16 tile of each texture, and portal.png is a 16x512 strip of 32
    // frames. The portal material samples the standalone strip instead, so the
    // geometry must emit plain 0..1 UVs covering one whole frame. The shader
    // then maps v into the current frame's slice of the strip.
    const uvRect = { u0: 0, v0: 0, u1: 1, v1: 1 };

    // Canonical axis: along X when an X neighbour is also a portal block.
    const hasXNeighbour =
      this.getBlockAt(chunk, x - 1, y, z) === BlockIds.Portal ||
      this.getBlockAt(chunk, x + 1, y, z) === BlockIds.Portal;

    if (hasXNeighbour) {
      for (const zOffset of [0.5 - inset, 0.5 + inset]) {
        buffers.pushQuad(
          [[x, y, z + zOffset], [x + 1, y, z + zOffset], [x + 1, y + 1, z + zOffset], [x, y + 1, z + zOffset]],
          [0, 0, 1], uvRect, tint, light, 1, FluidTextureKind.WaterStill,
        );
      }
    } else {
      for (const xOffset of [0.5 - inset, 0.5 + inset]) {
        buffers.pushQuad(
          [[x + xOffset, y, z], [x + xOffset, y, z + 1], [x + xOffset, y + 1, z + 1], [x + xOffset, y + 1, z]],
          [1, 0, 0], uvRect, tint, light, 1, FluidTextureKind.WaterStill,
        );
      }
    }
  }

  public build(chunk: Chunk): THREE.BufferGeometry {
    const buffers = new MeshBuffers();
    this.vegetationColors?.beginMeshBuild();

    const sectionPassMasks = this.getSectionPassMasks(chunk);
    for (let sectionIndex = 0; sectionIndex < CHUNK_SECTION_COUNT; sectionIndex++) {
      if (!hasChunkPass(sectionPassMasks[sectionIndex]!, ChunkPassMask.Terrain)) continue;
      const { startY, endY } = this.sectionYRange(sectionIndex);
      for (let y = startY; y < endY; y++) {
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
              smoothLighting.blockR,
              smoothLighting.blockG,
              smoothLighting.blockB,
              smoothLighting.aoFactors,
              smoothLighting.flipDiagonal,
            );
          }
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
    this.vegetationColors?.beginMeshBuild();

    const sectionPassMasks = this.getSectionPassMasks(chunk);
    for (let sectionIndex = 0; sectionIndex < CHUNK_SECTION_COUNT; sectionIndex++) {
      if (!hasChunkPass(sectionPassMasks[sectionIndex]!, ChunkPassMask.Cutout)) continue;
      const { startY, endY } = this.sectionYRange(sectionIndex);
      for (let y = startY; y < endY; y++) {
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
            // Leaves are meshed in buildLeaves() (separate opacity material).
            continue;
          } else if (renderType === 'cutout') {
            if (blockId === BlockIds.RedstoneTorchOff || blockId === BlockIds.RedstoneTorchOn || blockId === BlockIds.Torch) {
              this.buildTorch(buffers, chunk, x, y, z, blockId, definition);
              continue;
            }
            if (blockId === BlockIds.Slab) {
              this.buildSlab(buffers, chunk, x, y, z, blockId, definition);
              continue;
            }
            if (isDoorBlockId(blockId)) {
              this.buildDoor(buffers, chunk, x, y, z, blockId, definition);
              continue;
            }
            if (blockId === BlockIds.Trapdoor) {
              this.buildTrapdoor(buffers, chunk, x, y, z, blockId, definition);
              continue;
            }
            if (blockId === BlockIds.WoodStairs || blockId === BlockIds.CobblestoneStairs) {
              this.buildStairs(buffers, chunk, x, y, z, definition);
              continue;
            }
            if (blockId === BlockIds.Fence) {
              this.buildFence(buffers, chunk, x, y, z, definition);
              continue;
            }
            if (blockId === BlockIds.Rail || blockId === BlockIds.PoweredRail || blockId === BlockIds.DetectorRail) {
              this.buildRail(buffers, chunk, x, y, z, blockId);
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
            if (blockId === BlockIds.Bed) {
              this.buildBed(buffers, chunk, x, y, z, definition);
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
              buffers.pushFace(face, x, y, z, uvRect, tint, [light.sky, light.sky, light.sky, light.sky], [light.block, light.block, light.block, light.block], [light.blockR, light.blockR, light.blockR, light.blockR], [light.blockG, light.blockG, light.blockG, light.blockG], [light.blockB, light.blockB, light.blockB, light.blockB]);
            }
          } else if (renderType === 'redstone_wire') {
            this.buildRedstoneWire(buffers, chunk, x, y, z, blockId, definition);
          } else if (renderType === 'cross' && blockId !== BlockIds.Fire) {
            const crossMeta = chunk.getBlockMetadata(x, y, z);
            let textureName = resolveBlockTexture(definition, 'side');
            if (blockId === BlockIds.TallGrass && (crossMeta & 0xf) === 2) {
              textureName = 'fern';
            } else if (blockId === BlockIds.TallGrass) {
              textureName = textureName ?? 'tall_grass';
            }
            const uvRect = this.getSafeUvRect(textureName);
            const tint = this.resolveVegetationTint(blockId, 'side', resolveBlockTint(definition, 'side'), chunk.chunkX * CHUNK_SIZE_X + x, chunk.chunkZ * CHUNK_SIZE_Z + z, crossMeta);
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
              buffers.pushCactusFace(i, x, y, z, uvRect, tint, smoothLighting.skyLevels, smoothLighting.blockLevels, smoothLighting.blockR, smoothLighting.blockG, smoothLighting.blockB, smoothLighting.aoFactors, smoothLighting.flipDiagonal);
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
            // Skip here — ice is handled by the separate translucent pass
          }
        }
      }
    }
    }

    this.lastLeafCullStats = { ...buffers.leafStats };
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
    const buffers = new MeshBuffers(true);
    this.vegetationColors?.beginMeshBuild();

    // All fire planes use the SAME texture row (row 0).
    // The shader advances the animation frame uniformly for the entire block.
    // Every plane belonging to the same fire block is synchronized.
    const V0 = 0;  // raw row index, shader divides by 32
    const V1 = 1;  // raw row index

    const sectionPassMasks = this.getSectionPassMasks(chunk);
    for (let sectionIndex = 0; sectionIndex < CHUNK_SECTION_COUNT; sectionIndex++) {
      if (!hasChunkPass(sectionPassMasks[sectionIndex]!, ChunkPassMask.Fire)) continue;
      const { startY, endY } = this.sectionYRange(sectionIndex);
      for (let y = startY; y < endY; y++) {
        for (let z = 0; z < CHUNK_SIZE_Z; z++) {
          for (let x = 0; x < CHUNK_SIZE_X; x++) {
          const blockId = chunk.getBlock(x, y, z);
          if (blockId !== BlockIds.Fire) continue;

          const light = this.getLightComponentsAt(chunk, x, y, z);
          const lightSample: LightSample = light;

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
      [light.blockR, light.blockR, light.blockR, light.blockR],
      [light.blockG, light.blockG, light.blockG, light.blockG],
      [light.blockB, light.blockB, light.blockB, light.blockB],
    );

    // +X side
    buffers.pushFace(
      { nx: 1, ny: 0, nz: 0, dx: 1, dy: 0, dz: 0, slot: 'side',
        corners: [[1, 0, 0], [1, H, 0], [1, H, 1], [1, 0, 1]] },
      x, y, z, uvRect, tint,
      [light.sky, light.sky, light.sky, light.sky],
      [light.block, light.block, light.block, light.block],
      [light.blockR, light.blockR, light.blockR, light.blockR],
      [light.blockG, light.blockG, light.blockG, light.blockG],
      [light.blockB, light.blockB, light.blockB, light.blockB],
    );

    // -X side
    buffers.pushFace(
      { nx: -1, ny: 0, nz: 0, dx: -1, dy: 0, dz: 0, slot: 'side',
        corners: [[0, 0, 1], [0, H, 1], [0, H, 0], [0, 0, 0]] },
      x, y, z, uvRect, tint,
      [light.sky, light.sky, light.sky, light.sky],
      [light.block, light.block, light.block, light.block],
      [light.blockR, light.blockR, light.blockR, light.blockR],
      [light.blockG, light.blockG, light.blockG, light.blockG],
      [light.blockB, light.blockB, light.blockB, light.blockB],
    );

    // +Z side
    buffers.pushFace(
      { nx: 0, ny: 0, nz: 1, dx: 0, dy: 0, dz: 1, slot: 'side',
        corners: [[0, 0, 1], [1, 0, 1], [1, H, 1], [0, H, 1]] },
      x, y, z, uvRect, tint,
      [light.sky, light.sky, light.sky, light.sky],
      [light.block, light.block, light.block, light.block],
      [light.blockR, light.blockR, light.blockR, light.blockR],
      [light.blockG, light.blockG, light.blockG, light.blockG],
      [light.blockB, light.blockB, light.blockB, light.blockB],
    );

    // -Z side
    buffers.pushFace(
      { nx: 0, ny: 0, nz: -1, dx: 0, dy: 0, dz: -1, slot: 'side',
        corners: [[0, H, 0], [1, H, 0], [1, 0, 0], [0, 0, 0]] },
      x, y, z, uvRect, tint,
      [light.sky, light.sky, light.sky, light.sky],
      [light.block, light.block, light.block, light.block],
      [light.blockR, light.blockR, light.blockR, light.blockR],
      [light.blockG, light.blockG, light.blockG, light.blockG],
      [light.blockB, light.blockB, light.blockB, light.blockB],
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
    this.vegetationColors?.beginMeshBuild();

    const sectionPassMasks = this.getSectionPassMasks(chunk);
    for (let sectionIndex = 0; sectionIndex < CHUNK_SECTION_COUNT; sectionIndex++) {
      if (!hasChunkPass(sectionPassMasks[sectionIndex]!, ChunkPassMask.Translucent)) continue;
      const { startY, endY } = this.sectionYRange(sectionIndex);
      for (let y = startY; y < endY; y++) {
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
              smoothLighting.skyLevels, smoothLighting.blockLevels, smoothLighting.blockR, smoothLighting.blockG, smoothLighting.blockB,
              smoothLighting.aoFactors, smoothLighting.flipDiagonal,
            );
          }
        }
      }
    }
    }

    return buffers.toGeometry();
  }


  public buildLeaves(chunk: Chunk): THREE.BufferGeometry {
    const buffers = new MeshBuffers();
    this.vegetationColors?.beginMeshBuild();
    const sectionPassMasks = this.getSectionPassMasks(chunk);
    for (let sectionIndex = 0; sectionIndex < CHUNK_SECTION_COUNT; sectionIndex++) {
      if (!hasChunkPass(sectionPassMasks[sectionIndex]!, ChunkPassMask.Leaves)) continue;
      const { startY, endY } = this.sectionYRange(sectionIndex);
      for (let y = startY; y < endY; y++) {
        for (let z = 0; z < CHUNK_SIZE_Z; z++) {
          for (let x = 0; x < CHUNK_SIZE_X; x++) {
            const blockId = chunk.getBlock(x, y, z);
            if (blockId === AIR_BLOCK_ID) continue;
            const definition = this.blockRegistry.getById(blockId);
            if (definition === undefined || definition.renderType !== 'leaves') continue;
            for (const face of FACES) {
              const neighbourId = this.getBlockAt(chunk, x + face.dx, y + face.dy, z + face.dz);
              buffers.leafStats.tested += 1;
              const hide = this.hidesLeafFace(neighbourId, face);
              if (hide === 'opaque') {
                buffers.leafStats.culledOpaque += 1;
                continue;
              }
              // leaf-to-leaf intentionally not culled
              buffers.leafStats.emitted += 1;
              const textureName = resolveBlockTexture(definition, face.slot!);
              const uvRect = textureName !== undefined ? this.atlas.getUvRect(textureName) : undefined;
              const tint = this.resolveVegetationTint(
                blockId,
                face.slot!,
                resolveBlockTint(definition, face.slot!),
                chunk.chunkX * CHUNK_SIZE_X + x,
                chunk.chunkZ * CHUNK_SIZE_Z + z,
              );
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
                smoothLighting.blockR,
                smoothLighting.blockG,
                smoothLighting.blockB,
                smoothLighting.aoFactors,
                smoothLighting.flipDiagonal,
              );
            }
          }
        }
      }
    }
    this.lastLeafCullStats = { ...buffers.leafStats };
    return buffers.toGeometry();
  }

  /**
   * Beta 1.7.3 Nether portal plane (`BlockPortal`, render pass 1).
   *
   * The portal is a thin quad pair inset into the block, oriented by the
   * canonical portal axis so frame validation, collision bounds, meshing,
   * particles and teleport placement all agree. Beta's
   * `BlockPortal.shouldSideBeRendered` only draws the two faces across the
   * thin axis, which is reproduced here by emitting one plane per side.
   *
   * Animation is driven by a frame uniform on the portal material, so the
   * geometry is never rebuilt to advance the animation.
   */
  public buildPortals(chunk: Chunk): THREE.BufferGeometry {
    const buffers = new MeshBuffers();
    const sectionPassMasks = this.getSectionPassMasks(chunk);

    for (let sectionIndex = 0; sectionIndex < CHUNK_SECTION_COUNT; sectionIndex++) {
      if (!hasChunkPass(sectionPassMasks[sectionIndex]!, ChunkPassMask.Portal)) continue;
      const { startY, endY } = this.sectionYRange(sectionIndex);
      for (let y = startY; y < endY; y++) {
        for (let z = 0; z < CHUNK_SIZE_Z; z++) {
          for (let x = 0; x < CHUNK_SIZE_X; x++) {
            if (chunk.getBlock(x, y, z) !== BlockIds.Portal) continue;
            // Delegates to the shared emitter so the standalone and
            // single-pass worker paths can never diverge.
            this.emitPortalBlock(chunk, buffers, x, y, z);
          }
        }
      }
    }

    return buffers.toGeometry();
  }

  public buildWater(chunk: Chunk): THREE.BufferGeometry {
    const buffers = new MeshBuffers(true);
    this.vegetationColors?.beginMeshBuild();

    const sectionPassMasks = this.getSectionPassMasks(chunk);
    for (let sectionIndex = 0; sectionIndex < CHUNK_SECTION_COUNT; sectionIndex++) {
      if (!hasChunkPass(sectionPassMasks[sectionIndex]!, ChunkPassMask.Water)) continue;
      const { startY, endY } = this.sectionYRange(sectionIndex);
      for (let y = startY; y < endY; y++) {
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
    }

    return buffers.toGeometry();
  }

  public buildLava(chunk: Chunk): THREE.BufferGeometry {
    const buffers = new MeshBuffers(true);
    this.vegetationColors?.beginMeshBuild();

    const sectionPassMasks = this.getSectionPassMasks(chunk);
    for (let sectionIndex = 0; sectionIndex < CHUNK_SECTION_COUNT; sectionIndex++) {
      if (!hasChunkPass(sectionPassMasks[sectionIndex]!, ChunkPassMask.Lava)) continue;
      const { startY, endY } = this.sectionYRange(sectionIndex);
      for (let y = startY; y < endY; y++) {
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
    }

    return buffers.toGeometry();
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

  /**
   * Leaf face culling (no greedy meshing, leaf-to-leaf kept):
   * - opaque full cubes hide all six leaf faces
   * - leaf-to-leaf always renders (airier canopy)
   * - glass/fluid/cutout/air/non-full keep the face
   */
  private hidesLeafFace(neighbourId: BlockId, _face: { readonly dy: number }): 'opaque' | 'leaves' | false {
    if (neighbourId === AIR_BLOCK_ID) return false;
    // Explicitly do NOT cull leaf-to-leaf.
    if (
      neighbourId === BlockIds.Leaves ||
      neighbourId === BlockIds.SpruceLeaves ||
      neighbourId === BlockIds.BirchLeaves
    ) {
      return false;
    }
    const neighbourDef = this.blockRegistry.getById(neighbourId);
    if (neighbourDef === undefined) return false;
    if (neighbourDef.renderType === 'leaves') return false;
    if (neighbourDef.solid && !neighbourDef.transparent && neighbourDef.renderType === 'opaque') {
      return 'opaque';
    }
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

  private buildRedstoneWire(
    buffers: MeshBuffers,
    chunk: Chunk,
    x: number,
    y: number,
    z: number,
    _blockId: BlockId,
    _definition: BlockDefinition,
  ): void {
    const metadata = chunk.getBlockMetadata(x, y, z);
    const tint = getRedstoneColor(metadata);
    const light = this.getLightComponentsAt(chunk, x, y, z);
    
    const connections = getWireConnections(
      {
        getBlock: (bx, by, bz) => this.getBlockAt(chunk, bx, by, bz),
        isNormalCube: (bx, by, bz) => {
            const id = this.getBlockAt(chunk, bx, by, bz);
            const def = this.blockRegistry.getById(id);
            return def !== undefined && def.solid && !def.transparent && def.renderType === 'opaque';
        },
      },
      x, y, z,
      (id) => {
        if (id === BlockIds.RedstoneWire) return true;
        return id === BlockIds.RedstoneTorchOn || id === BlockIds.RedstoneTorchOff || 
               id === BlockIds.Lever || id === BlockIds.StoneButton || 
               id === BlockIds.StonePressurePlate || id === BlockIds.WoodPressurePlate;
      }
    );

    const isW = connections.west !== WireConnection.NONE;
    const isE = connections.east !== WireConnection.NONE;
    const isN = connections.north !== WireConnection.NONE;
    const isS = connections.south !== WireConnection.NONE;

    let straightPass = 0;
    if ((isW || isE) && !isN && !isS) straightPass = 1; // EW
    if ((isN || isS) && !isW && !isE) straightPass = 2; // NS

    const textureBase = straightPass !== 0 ? 'redstone_dust_line' : 'redstone_dust_cross';
    const textureOver = straightPass !== 0 ? 'redstone_dust_line_overlay' : 'redstone_dust_cross_overlay';
    
    const uvBase = this.getSafeUvRect(textureBase);
    const uvOver = this.getSafeUvRect(textureOver);
    if (!uvBase || !uvOver) return;

    let minX = 0, maxX = 1, minZ = 0, maxZ = 1;
    let u0 = uvBase.u0, v0 = uvBase.v0, u1 = uvBase.u1, v1 = uvBase.v1;
    let ou0 = uvOver.u0, ov0 = uvOver.v0, ou1 = uvOver.u1, ov1 = uvOver.v1;

    if (straightPass === 0 && (isN || isS || isE || isW)) {
        // Beta cropping: arms are 5/16 thick (0.3125)
        if (!isW) { minX += 0.3125; u0 += (u1 - u0) * 0.3125; ou0 += (ou1 - ou0) * 0.3125; }
        if (!isE) { maxX -= 0.3125; u1 -= (u1 - u0) * 0.3125; ou1 -= (ou1 - ou0) * 0.3125; }
        if (!isN) { minZ += 0.3125; v0 += (v1 - v0) * 0.3125; ov0 += (ov1 - ov0) * 0.3125; }
        if (!isS) { maxZ -= 0.3125; v1 -= (v1 - v0) * 0.3125; ov1 -= (ov1 - ov0) * 0.3125; }
    }

    const h = 0.015625;
    const floorV: [Corner, Corner, Corner, Corner] = [
        [minX, h, maxZ], [maxX, h, maxZ], [maxX, h, minZ], [minX, h, minZ]
    ];

    const rotate = straightPass === 2;
    const finalUvs: Quad8 = rotate 
        ? [u1, v0, u1, v1, u0, v1, u0, v0] 
        : [u0, v1, u1, v1, u1, v0, u0, v0];
    const finalOverUvs: Quad8 = rotate
        ? [ou1, ov0, ou1, ov1, ou0, ov1, ou0, ov0]
        : [ou0, ov1, ou1, ov1, ou1, ov0, ou0, ov0];

    const worldFloorV = floorV.map(v => [x + v[0], y + v[1], z + v[2]]) as unknown as [Corner, Corner, Corner, Corner];
    
    // Pass 1: Tinted
    buffers.pushQuad(worldFloorV, [0, 1, 0], uvBase, tint, light, 1, FluidTextureKind.WaterStill, finalUvs);
    // Pass 2: White overlay
    buffers.pushQuad(worldFloorV, [0, 1, 0], uvOver, [1, 1, 1], light, 1, FluidTextureKind.WaterStill, finalOverUvs);

    // Vertical strips
    const vBase = this.getSafeUvRect('redstone_dust_line');
    const vOver = this.getSafeUvRect('redstone_dust_line_overlay');
    if (vBase && vOver) {
        const vUvs: Quad8 = [vBase.u0, vBase.v1, vBase.u1, vBase.v1, vBase.u1, vBase.v0, vBase.u0, vBase.v0];
        const vOverUvs: Quad8 = [vOver.u0, vOver.v1, vOver.u1, vOver.v1, vOver.u1, vOver.v0, vOver.u0, vOver.v0];

        if (connections.north === WireConnection.UP) {
            const v = [[x, y + 1, z + h], [x + 1, y + 1, z + h], [x + 1, y, z + h], [x, y, z + h]] as [Corner, Corner, Corner, Corner];
            buffers.pushQuad(v, [0, 0, 1], vBase, tint, light, 1, FluidTextureKind.WaterStill, vUvs);
            buffers.pushQuad(v, [0, 0, 1], vOver, [1, 1, 1], light, 1, FluidTextureKind.WaterStill, vOverUvs);
        }
        if (connections.south === WireConnection.UP) {
            const v = [[x + 1, y + 1, z + 1 - h], [x, y + 1, z + 1 - h], [x, y, z + 1 - h], [x + 1, y, z + 1 - h]] as [Corner, Corner, Corner, Corner];
            buffers.pushQuad(v, [0, 0, -1], vBase, tint, light, 1, FluidTextureKind.WaterStill, vUvs);
            buffers.pushQuad(v, [0, 0, -1], vOver, [1, 1, 1], light, 1, FluidTextureKind.WaterStill, vOverUvs);
        }
        if (connections.west === WireConnection.UP) {
            const v = [[x + h, y + 1, z + 1], [x + h, y + 1, z], [x + h, y, z], [x + h, y, z + 1]] as [Corner, Corner, Corner, Corner];
            buffers.pushQuad(v, [1, 0, 0], vBase, tint, light, 1, FluidTextureKind.WaterStill, vUvs);
            buffers.pushQuad(v, [1, 0, 0], vOver, [1, 1, 1], light, 1, FluidTextureKind.WaterStill, vOverUvs);
        }
        if (connections.east === WireConnection.UP) {
            const v = [[x + 1 - h, y + 1, z], [x + 1 - h, y + 1, z + 1], [x + 1 - h, y, z + 1], [x + 1 - h, y, z]] as [Corner, Corner, Corner, Corner];
            buffers.pushQuad(v, [-1, 0, 0], vBase, tint, light, 1, FluidTextureKind.WaterStill, vUvs);
            buffers.pushQuad(v, [-1, 0, 0], vOver, [1, 1, 1], light, 1, FluidTextureKind.WaterStill, vOverUvs);
        }
    }
  }

  private buildTorch(
    buffers: MeshBuffers,
    chunk: Chunk,
    x: number,
    y: number,
    z: number,
    _blockId: BlockId,
    definition: BlockDefinition,
  ): void {
    const metadata = chunk.getBlockMetadata(x, y, z);
    const textureName = resolveBlockTexture(definition, 'side') || 'torch_on';
    const uvRect = this.getSafeUvRect(textureName);
    if (!uvRect) return;

    const tint: [number, number, number] = [1, 1, 1];
    const light = this.getLightComponentsAt(chunk, x, y, z);

    let dx = 0, dz = 0;
    let ox = 0, oz = 0;
    let oy = 0;

    const tilt = 0.4;
    const shift = 0.5 - tilt;
    const yShift = 0.2;

    if (metadata === 1) { dx = -tilt; ox = -shift; oy = yShift; }
    else if (metadata === 2) { dx = tilt; ox = shift; oy = yShift; }
    else if (metadata === 3) { dz = -tilt; oz = -shift; oy = yShift; }
    else if (metadata === 4) { dz = tilt; oz = shift; oy = yShift; }

    const u0 = uvRect.u0, v0 = uvRect.v0, u1 = uvRect.u1, v1 = uvRect.v1;
    const w = 0.0625;

    const cx = x + 0.5, cz = z + 0.5;
    const px = cx + ox, pz = cz + oz;

    // Top face
    const th = 0.625;
    const topV = [
        [px - w, y + th + oy, pz - w],
        [px - w, y + th + oy, pz + w],
        [px + w, y + th + oy, pz + w],
        [px + w, y + th + oy, pz - w]
    ] as const;
    const tu0 = u0 + (u1 - u0) * 7/16, tv0 = v0 + (v1 - v0) * 6/16, tu1 = u0 + (u1 - u0) * 9/16, tv1 = v0 + (v1 - v0) * 8/16;
    buffers.pushQuad(topV as any, [0, 1, 0], uvRect, tint, light, 1, FluidTextureKind.WaterStill, [tu0, tv1, tu0, tv0, tu1, tv0, tu1, tv1]);

    const su0 = u0 + (u1 - u0) * 7 / 16;
    const su1 = u0 + (u1 - u0) * 9 / 16;
    const sv0 = v0 + (v1 - v0) * 6 / 16;
    const sv1 = v1;
    const sideUvsTopBottom: Quad8 = [su0, sv0, su0, sv1, su1, sv1, su1, sv0];
    const sideUvsAcrossTop: Quad8 = [su0, sv0, su1, sv0, su1, sv1, su0, sv1];

    // Side faces use the central 2-pixel torch strip, not the whole tile.
    // -X face
    buffers.pushQuad([
        [px - w, y + th + oy, pz + w],
        [px - w + dx, y + oy, pz + w + dz],
        [px - w + dx, y + oy, pz - w + dz],
        [px - w, y + th + oy, pz - w]
    ], [-1, 0, 0], uvRect, tint, light, 1, FluidTextureKind.WaterStill, sideUvsTopBottom);
    // +X face
    buffers.pushQuad([
        [px + w, y + th + oy, pz - w],
        [px + w + dx, y + oy, pz - w + dz],
        [px + w + dx, y + oy, pz + w + dz],
        [px + w, y + th + oy, pz + w]
    ], [1, 0, 0], uvRect, tint, light, 1, FluidTextureKind.WaterStill, sideUvsTopBottom);
    // -Z face
    buffers.pushQuad([
        [px - w, y + th + oy, pz - w],
        [px + w, y + th + oy, pz - w],
        [px + w + dx, y + oy, pz - w + dz],
        [px - w + dx, y + oy, pz - w + dz]
    ], [0, 0, -1], uvRect, tint, light, 1, FluidTextureKind.WaterStill, sideUvsAcrossTop);
    // +Z face
    buffers.pushQuad([
        [px - w, y + th + oy, pz + w],
        [px - w + dx, y + oy, pz + w + dz],
        [px + w + dx, y + oy, pz + w + dz],
        [px + w, y + th + oy, pz + w]
    ], [0, 0, 1], uvRect, tint, light, 1, FluidTextureKind.WaterStill, sideUvsTopBottom);
  }

  /**
   * Emits a box in local cell coordinates. Shared by the stair and fence
   * builders so their geometry is generated from the same declarations the
   * collision and selection paths read, keeping the two in agreement.
   */
  private pushLocalBox(
    buffers: MeshBuffers,
    x: number, y: number, z: number,
    b: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number },
    uvRect: { u0: number; v0: number; u1: number; v1: number } | undefined,
    tint: readonly [number, number, number],
    light: LightSample,
  ): void {
    const { minX, minY, minZ, maxX, maxY, maxZ } = b;
    const x0 = x + minX, x1 = x + maxX;
    const y0 = y + minY, y1 = y + maxY;
    const z0 = z + minZ, z1 = z + maxZ;

    // Beta shades faces by orientation; reuse the same relative brightness the
    // cube path applies so a stair blends with the blocks around it.
    const TOP = 1, BOTTOM = 0.5, NS = 0.8, EW = 0.6;

    buffers.pushQuad([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], uvRect, tint, light, 1, FluidTextureKind.WaterStill, undefined, undefined, TOP);
    buffers.pushQuad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], uvRect, tint, light, 1, FluidTextureKind.WaterStill, undefined, undefined, BOTTOM);
    buffers.pushQuad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], uvRect, tint, light, 1, FluidTextureKind.WaterStill, undefined, undefined, NS);
    buffers.pushQuad([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], uvRect, tint, light, 1, FluidTextureKind.WaterStill, undefined, undefined, NS);
    buffers.pushQuad([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], uvRect, tint, light, 1, FluidTextureKind.WaterStill, undefined, undefined, EW);
    buffers.pushQuad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], uvRect, tint, light, 1, FluidTextureKind.WaterStill, undefined, undefined, EW);
  }

  /**
   * Beta `BlockStairs`: a half-height base plus a half-cell full-height step
   * on the side opposite the facing. Geometry comes from stairShapes so it
   * matches the collision and selection boxes exactly.
   */
  private buildStairs(
    buffers: MeshBuffers,
    chunk: Chunk,
    x: number, y: number, z: number,
    definition: BlockDefinition,
  ): void {
    const metadata = chunk.getBlockMetadata(x, y, z);
    const uvRect = this.getSafeUvRect(resolveBlockTexture(definition, 'side'));
    if (uvRect === undefined) return;
    const tint = resolveBlockTint(definition, 'side');
    const light = this.getLightComponentsAt(chunk, x, y, z);
    for (const shape of stairShapes(metadata)) {
      this.pushLocalBox(buffers, x, y, z, shape, uvRect, tint, light);
    }
  }

  /**
   * Beta `BlockFence`: a centre post plus a rail toward each connected
   * neighbour. Connections are recomputed here from chunk data (the mesher
   * cannot use the behaviour context), but follow the same rule as
   * fenceConnectionsAt: link to fences and to solid blocks.
   */
  private buildFence(
    buffers: MeshBuffers,
    chunk: Chunk,
    x: number, y: number, z: number,
    definition: BlockDefinition,
  ): void {
    const uvRect = this.getSafeUvRect(resolveBlockTexture(definition, 'side'));
    if (uvRect === undefined) return;
    const tint = resolveBlockTint(definition, 'side');
    const light = this.getLightComponentsAt(chunk, x, y, z);

    const links = (dx: number, dz: number): boolean => {
      const id = this.getBlockAt(chunk, x + dx, y, z + dz);
      if (id === BlockIds.Fence) return true;
      const def = this.blockRegistry.getById(id);
      return def?.solid === true;
    };

    const connections = {
      negX: links(-1, 0), posX: links(1, 0),
      negZ: links(0, -1), posZ: links(0, 1),
    };

    for (const shape of fenceSelectionShapes(connections)) {
      this.pushLocalBox(buffers, x, y, z, shape, uvRect, tint, light);
    }
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
    const br = [light.blockR, light.blockR, light.blockR, light.blockR] as Quad4;
    const bg = [light.blockG, light.blockG, light.blockG, light.blockG] as Quad4;
    const bb = [light.blockB, light.blockB, light.blockB, light.blockB] as Quad4;

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
        x, y, z, uvRect, tint, l, b, br, bg, bb
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

    // Read the panel straight from the shared shape declaration, so the
    // rendered door and its collision/selection box can never disagree.
    // (This previously duplicated the state maths with its own thickness.)
    const panel = doorShape(baseMeta);
    const minX = panel.minX, maxX = panel.maxX;
    const minZ = panel.minZ, maxZ = panel.maxZ;

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
    const br = [light.blockR, light.blockR, light.blockR, light.blockR] as Quad4;
    const bg = [light.blockG, light.blockG, light.blockG, light.blockG] as Quad4;
    const bb = [light.blockB, light.blockB, light.blockB, light.blockB] as Quad4;

    const pushQuadFromBounds = (
      dir: FaceDirection,
      p0: [number, number, number], p1: [number, number, number], p2: [number, number, number], p3: [number, number, number],
      normal: [number, number, number]
    ) => {
      if (!uvRect) return;
      buffers.pushFace({ nx: normal[0], ny: normal[1], nz: normal[2], dx: normal[0], dy: normal[1], dz: normal[2], dir: dir, corners: [p0, p1, p2, p3] as any }, x, y, z, uvRect, tint, l, b, br, bg, bb);
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
    const shape = trapdoorShape(meta);
    const minX = shape.minX;
    const minY = shape.minY;
    const minZ = shape.minZ;
    const maxX = shape.maxX;
    const maxY = shape.maxY;
    const maxZ = shape.maxZ;

    const textureName = resolveBlockTexture(definition, 'side') || 'trapdoor';
    const uvRect = this.getSafeUvRect(textureName);
    const tint = this.resolveVegetationTint(blockId, 'side', resolveBlockTint(definition, 'side'), chunk.chunkX * CHUNK_SIZE_X + x, chunk.chunkZ * CHUNK_SIZE_Z + z);
    const light = this.getMaxNeighborLight(chunk, x, y, z);
    const l = [light.sky, light.sky, light.sky, light.sky] as Quad4;
    const b = [light.block, light.block, light.block, light.block] as Quad4;
    const br = [light.blockR, light.blockR, light.blockR, light.blockR] as Quad4;
    const bg = [light.blockG, light.blockG, light.blockG, light.blockG] as Quad4;
    const bb = [light.blockB, light.blockB, light.blockB, light.blockB] as Quad4;

    const pushQuadFromBounds = (dir: FaceDirection, p0: any, p1: any, p2: any, p3: any, normal: any) => {
      buffers.pushFace({ nx: normal[0], ny: normal[1], nz: normal[2], dx: normal[0], dy: normal[1], dz: normal[2], dir: dir, corners: [p0, p1, p2, p3] as any }, x, y, z, uvRect, tint, l, b, br, bg, bb);
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
    const br = [light.blockR, light.blockR, light.blockR, light.blockR] as Quad4;
    const bg = [light.blockG, light.blockG, light.blockG, light.blockG] as Quad4;
    const bb = [light.blockB, light.blockB, light.blockB, light.blockB] as Quad4;

    const pushQuadFromBounds = (dir: FaceDirection, p0: any, p1: any, p2: any, p3: any, normal: any) => {
      buffers.pushFace({ nx: normal[0], ny: normal[1], nz: normal[2], dx: normal[0], dy: normal[1], dz: normal[2], dir: dir, corners: [p0, p1, p2, p3] as any }, x, y, z, uvRect, tint, l, b, br, bg, bb);
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
    const br = [light.blockR, light.blockR, light.blockR, light.blockR] as Quad4;
    const bg = [light.blockG, light.blockG, light.blockG, light.blockG] as Quad4;
    const bb = [light.blockB, light.blockB, light.blockB, light.blockB] as Quad4;

    const pushQuadFromBounds = (faceDir: FaceDirection, p0: any, p1: any, p2: any, p3: any, normal: any) => {
      buffers.pushFace({ nx: normal[0], ny: normal[1], nz: normal[2], dx: normal[0], dy: normal[1], dz: normal[2], dir: faceDir, corners: [p0, p1, p2, p3] as any }, x, y, z, uvRect, tint, l, b, br, bg, bb);
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
      buffers.pushFace({ nx, ny, nz, dx, dy, dz, slot: 'side', corners }, x, y, z, cobbleRect, tint, [light.sky, light.sky, light.sky, light.sky], [light.block, light.block, light.block, light.block], [light.blockR, light.blockR, light.blockR, light.blockR], [light.blockG, light.blockG, light.blockG, light.blockG], [light.blockB, light.blockB, light.blockB, light.blockB]);
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

  /**
   * Beta 1.7.3 bed (`RenderBlocks.renderBlockBed`).
   *
   * The bed is a single 9/16-tall box per half. Beta draws:
   *  - the top surface at `maxY` (0.5625) with the head/foot top texture,
   *    rotated per direction via the `bedDirection` table;
   *  - an underside plank quad at `minY + 0.1875`;
   *  - four side faces, of which the one joining the two halves is skipped
   *    (`ModelBed.headInvisibleFace`), which is what stops the seam showing;
   *  - two of the side faces mirrored (`flipTexture`) so the wood grain runs
   *    continuously across both halves.
   *
   * The previous version drew a floating top and never skipped the joining
   * face or mirrored the sides, which is the gap visible in the screenshot.
   */
  /**
   * Beta `ModelBed.bedDirection` quarter-turns for the top face, indexed by
   * the bed's facing metadata. Kept beside the mesher so the rotation is
   * declared once rather than derived inline.
   */
  private static readonly BED_TOP_UV_TURNS_TABLE: readonly number[] = [3, 0, 1, 2];

  private buildBed(
    buffers: MeshBuffers,
    chunk: Chunk,
    x: number, y: number, z: number,
    definition: BlockDefinition,
  ): void {
    const metadata = chunk.getBlockMetadata(x, y, z);
    const direction = metadata & 3;
    const isHead = (metadata & 8) !== 0;

    const topRect = this.getSafeUvRect(isHead ? 'bed_head_top' : 'bed_feet_top');
    const sideRect = this.getSafeUvRect(isHead ? 'bed_head_side' : 'bed_feet_side');
    const endRect = this.getSafeUvRect(isHead ? 'bed_head_end' : 'bed_feet_end');
    const baseRect = this.getSafeUvRect(resolveBlockTexture(definition, 'bottom') ?? 'planks_oak');
    if (topRect === undefined || sideRect === undefined || endRect === undefined) return;

    const tint = resolveBlockTint(definition, 'side');
    const light = this.getLightComponentsAt(chunk, x, y, z);
    // Both halves derive their box from BED_HEIGHT alone, so the head and foot
    // side faces can never disagree on height, and the UV span below is always
    // computed from the same constant as the geometry.
    const yTop = y + BED_HEIGHT;
    const y0 = yTop - BED_HEIGHT;
    const yBase = y + 0.1875;
    const x0 = x, x1 = x + 1, z0 = z, z1 = z + 1;

    const uv = (
      rect: { u0: number; v0: number; u1: number; v1: number },
      quarterTurns = 0,
      mirror = false,
    ): Quad8 => {
      let corners: [number, number][] = [[rect.u0, rect.v1], [rect.u1, rect.v1], [rect.u1, rect.v0], [rect.u0, rect.v0]];
      if (mirror) corners = [corners[1]!, corners[0]!, corners[3]!, corners[2]!];
      const turns = ((quarterTurns % 4) + 4) % 4;
      const out = corners.slice(turns).concat(corners.slice(0, turns));
      return [out[0]![0], out[0]![1], out[1]![0], out[1]![1], out[2]![0], out[2]![1], out[3]![0], out[3]![1]];
    };

    /**
     * Side/end UVs for the bed box.
     *
     * Beta's `RenderBlocks.renderEastFace` (and its N/S/W siblings) derive the
     * V span from the block's own bounds rather than the whole tile:
     *   vTop    = tileRow + 16 - maxY * 16
     *   vBottom = tileRow + 16 - minY * 16
     * With the 9/16-tall bed that samples only the bottom 9 texture rows.
     *
     * That matters because `bed_*_side` / `bed_*_end` are authored with their
     * top 7 rows fully transparent. Stretching the entire 16-row tile across
     * the 9px-tall face therefore renders a transparent strip along the top of
     * every side — the visible "bed side gap". Sampling the sub-range instead
     * restores Beta's 1:1 texel scale and fills the face to the top surface.
     */
    const sideUv = (
      rect: { u0: number; v0: number; u1: number; v1: number },
      mirror = false,
    ): Quad8 => {
      const vBottom = rect.v1;
      const vTop = rect.v0 + (rect.v1 - rect.v0) * (1 - BED_HEIGHT);
      let corners: [number, number][] = [[rect.u0, vBottom], [rect.u1, vBottom], [rect.u1, vTop], [rect.u0, vTop]];
      if (mirror) corners = [corners[1]!, corners[0]!, corners[3]!, corners[2]!];
      return [corners[0]![0], corners[0]![1], corners[1]![0], corners[1]![1], corners[2]![0], corners[2]![1], corners[3]![0], corners[3]![1]];
    };

    const push = (
      corners: [Corner, Corner, Corner, Corner],
      normal: readonly [number, number, number],
      rect: { u0: number; v0: number; u1: number; v1: number },
      faceUvs?: Quad8,
    ): void => buffers.pushQuad(corners, normal, rect, tint, light, 1, FluidTextureKind.WaterStill, faceUvs);

    // One canonical cuboid half. Metadata controls only which side face is the
    // hidden join and which side receives the end texture; the cuboid itself is
    // never hand-authored per direction, so all four rotations stay coherent.
    push(
      [[x0, yTop, z1], [x1, yTop, z1], [x1, yTop, z0], [x0, yTop, z0]],
      [0, 1, 0],
      topRect,
      uv(topRect, (ChunkMesher.BED_TOP_UV_TURNS_TABLE[direction & 3] ?? 0) + 2),
    );

    if (baseRect !== undefined) {
      push([[x0, yBase, z0], [x1, yBase, z0], [x1, yBase, z1], [x0, yBase, z1]], [0, -1, 0], baseRect);
    }

    const hiddenFace = bedHiddenFace(direction, isHead);
    const outwardFace = bedOutwardFace(direction, isHead);
    const flippedFace = bedFlippedFace(direction);
    const faces: readonly {
      face: number;
      corners: [Corner, Corner, Corner, Corner];
      normal: readonly [number, number, number];
    }[] = [
      { face: 2, corners: [[x1, y0, z0], [x0, y0, z0], [x0, yTop, z0], [x1, yTop, z0]], normal: [0, 0, -1] },
      { face: 3, corners: [[x0, y0, z1], [x1, y0, z1], [x1, yTop, z1], [x0, yTop, z1]], normal: [0, 0, 1] },
      { face: 4, corners: [[x0, y0, z0], [x0, y0, z1], [x0, yTop, z1], [x0, yTop, z0]], normal: [-1, 0, 0] },
      { face: 5, corners: [[x1, y0, z1], [x1, y0, z0], [x1, yTop, z0], [x1, yTop, z1]], normal: [1, 0, 0] },
    ];

    for (const face of faces) {
      if (face.face === hiddenFace) continue;
      const rect = face.face === outwardFace ? endRect : sideRect;
      push(face.corners, face.normal, rect, sideUv(rect, face.face === flippedFace));
    }
  }

  /**
   * Beta `BlockSign` wall variant.
   *
   * Beta's bounds are a full-width board from y=0.28125 to y=0.78125, 0.125
   * deep, flush against the wall the sign hangs on — and with no standing
   * post, which only exists on the freestanding sign. The previous model used
   * a centred 12/32 cube with the wrong texture, so it floated mid-cell.
   */
  private buildWallSign(buffers: MeshBuffers, chunk: Chunk, x: number, y: number, z: number, _blockId: BlockId, definition: BlockDefinition): void {
    const meta = chunk.getBlockMetadata(x, y, z);
    // Beta signs use the plank texture for the board.
    const textureName = resolveBlockTexture(definition, 'side') ?? 'planks_oak';
    const uvRect = this.getSafeUvRect(textureName);
    if (uvRect === undefined) return;
    const tint = resolveBlockTint(definition, 'side');
    const light = this.getMaxNeighborLight(chunk, x, y, z);

    // Beta BlockSign.setBlockBoundsBasedOnState (wall variant).
    const minY = 0.28125;
    const maxY = 0.78125;
    const depth = 0.125;
    let bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
    switch (meta) {
      case 2: bounds = { minX: 0, minZ: 1 - depth, maxX: 1, maxZ: 1 }; break;
      case 3: bounds = { minX: 0, minZ: 0, maxX: 1, maxZ: depth }; break;
      case 4: bounds = { minX: 1 - depth, minZ: 0, maxX: 1, maxZ: 1 }; break;
      case 5: bounds = { minX: 0, minZ: 0, maxX: depth, maxZ: 1 }; break;
      default: bounds = { minX: 0, minZ: 1 - depth, maxX: 1, maxZ: 1 }; break;
    }

    this.pushLocalBox(
      buffers, x, y, z,
      { minX: bounds.minX, minY, minZ: bounds.minZ, maxX: bounds.maxX, maxY, maxZ: bounds.maxZ },
      uvRect, tint, light,
    );
  }

  private buildRail(buffers: MeshBuffers, chunk: Chunk, x: number, y: number, z: number, blockId: BlockId): void {
    const meta = chunk.getBlockMetadata(x, y, z);
    const shape = getRailShapeForBlock(blockId, meta);
    if (shape === undefined) return;

    const powered = blockId === BlockIds.PoweredRail;
    const textureName = powered
      ? ((meta & 8) !== 0 ? 'rail_golden_powered' : 'rail_golden')
      : (blockId === BlockIds.DetectorRail ? 'rail_detector' : (shape.curve ? 'rail_normal_turned' : 'rail_normal'));
    const uvRect = this.getSafeUvRect(textureName);
    if (!uvRect) return;

    const tint: [number, number, number] = [1, 1, 1];
    const light = this.getLightComponentsAt(chunk, x, y, z);
    const h = 0.015625;
    let vertices: [Corner, Corner, Corner, Corner] = [
      [x, y + h, z + 1],
      [x + 1, y + h, z + 1],
      [x + 1, y + h, z],
      [x, y + h, z],
    ];

    if (shape.metadata === 2) {
      vertices = [[x, y + h, z + 1], [x + 1, y + 1 + h, z + 1], [x + 1, y + 1 + h, z], [x, y + h, z]];
    } else if (shape.metadata === 3) {
      vertices = [[x, y + 1 + h, z + 1], [x + 1, y + h, z + 1], [x + 1, y + h, z], [x, y + 1 + h, z]];
    } else if (shape.metadata === 4) {
      vertices = [[x, y + h, z + 1], [x + 1, y + h, z + 1], [x + 1, y + 1 + h, z], [x, y + 1 + h, z]];
    } else if (shape.metadata === 5) {
      vertices = [[x, y + 1 + h, z + 1], [x + 1, y + 1 + h, z + 1], [x + 1, y + h, z], [x, y + h, z]];
    }

    const u0 = uvRect.u0;
    const v0 = uvRect.v0;
    const u1 = uvRect.u1;
    const v1 = uvRect.v1;
    const rotations: readonly Quad8[] = [
      [u0, v1, u1, v1, u1, v0, u0, v0],
      [u1, v1, u1, v0, u0, v0, u0, v1],
      [u1, v0, u0, v0, u0, v1, u1, v1],
      [u0, v0, u0, v1, u1, v1, u1, v0],
    ];
    const uv = rotations[shape.textureRotationQuarterTurns] ?? rotations[0]!;
    buffers.pushQuad(vertices, [0, 1, 0], uvRect, tint, light, 1, FluidTextureKind.WaterStill, uv);
  }
}
