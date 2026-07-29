import * as THREE from 'three';
import { useOpaqueEntityQueue } from './RenderOrder';
import { RENDER_ORDER } from './RenderOrder';
import type { Chunk } from '../world/Chunk';
import type { ChunkManager } from '../world/ChunkManager';
import { CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z } from '../world/chunkConstants';
import { chunkKey } from '../world/chunkKey';
import { ChunkMesher } from './ChunkMesher';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { TextureAtlas } from '../assets/TextureAtlas';
import { ChunkMeshingQueue, type ChunkMeshQueueStats, type ChunkMeshGeometrySet } from './meshing/ChunkMeshingQueue';
import { ChunkPassMask, computeChunkPassMask, hasChunkPass } from './meshing/ChunkPassMask';
import { TEXTURE_MIN_BRIGHTNESS } from './voxelLighting';

/**
 * Beta `WorldProvider.generateLightBrightnessTable` ambient floor (`var1`).
 *
 * The base Overworld provider uses 0.05; `WorldProviderHell` overrides it to
 * 0.1, which is why the Nether never goes fully black even with no skylight.
 */
export const OVERWORLD_AMBIENT_LIGHT_FLOOR = 0.05;
import type { FluidAnimationSystem } from './fluid/FluidAnimationSystem';
import { FLUID_RENDER_SETTINGS } from './fluid/FluidRenderSettings';
import type { FireAnimationSystem } from './fire/FireAnimationSystem';
import type { PortalAnimationSystem } from './portal/PortalAnimationSystem';
import { VegetationColorProvider } from '../world/generation/climate/VegetationColors';

/** Max dirty chunk meshes rebuilt in a single frame. */
export const MESH_REBUILD_BUDGET = 4;

export const FOG_HEIGHT_START = 62;
export const FOG_HEIGHT_END = 96;

/**
 * Slack (in blocks) added around the analytic chunk bounding volume. Chunk
 * geometry is nominally confined to the 16 × 128 × 16 block grid, but some
 * passes emit vertices marginally outside it (fluid surface insets, fire
 * quads, shaped/cross models). Padding keeps the volume conservative — an
 * over-large bound only costs a draw call, whereas an under-sized one makes
 * visible chunks disappear.
 */
export const CHUNK_BOUNDS_MARGIN = 1;

/**
 * Radius of the analytic chunk bounding sphere, in chunk-local space and
 * centred on the chunk's midpoint. Sized to enclose the margin-padded box so
 * three.js's sphere-based frustum test can never reject a chunk whose geometry
 * is still on screen.
 */
export const CHUNK_BOUNDING_SPHERE_RADIUS = Math.sqrt(
  (CHUNK_SIZE_X * 0.5 + CHUNK_BOUNDS_MARGIN) ** 2 +
  (CHUNK_SIZE_Y * 0.5 + CHUNK_BOUNDS_MARGIN) ** 2 +
  (CHUNK_SIZE_Z * 0.5 + CHUNK_BOUNDS_MARGIN) ** 2,
);
const RUNTIME_GEOMETRY_VALIDATION_ENABLED = typeof import.meta !== 'undefined' && import.meta.env?.DEV === true;

/**
 * Placeholder geometry for a pass this chunk does not use.
 *
 * `fluidLayout` mirrors the pass, not the (absent) data, so an unused fluid
 * pass still declares the fluid attributes and geometry validation sees a
 * layout consistent with every other chunk's version of that pass.
 */
function createEmptyGeometry(fluidLayout: boolean): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(), 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(), 2));
  geometry.setAttribute('tintColor', new THREE.Float32BufferAttribute(new Float32Array(), 3));
  geometry.setAttribute('packedLight', new THREE.Uint8BufferAttribute(new Uint8Array(), 4, true));
  if (fluidLayout) {
    geometry.setAttribute('fluidTextureKind', new THREE.Float32BufferAttribute(new Float32Array(), 1));
    geometry.setAttribute('fluidFrameUv', new THREE.Float32BufferAttribute(new Float32Array(), 2));
  }
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(), 1));
  return geometry;
}

function geometryIsEmpty(geometry: THREE.BufferGeometry): boolean {
  const index = geometry.getIndex();
  if (index !== null) return index.count === 0;
  const position = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  return position === undefined || position.count === 0;
}

export function attachHeightAwareFog(material: THREE.MeshBasicMaterial): void {
  const uniforms = {
    uSkylightSubtracted: { value: 0 },
    uSunBrightnessFactor: { value: 1 },
    uTextureMinBrightness: { value: TEXTURE_MIN_BRIGHTNESS },
    uDynamicLightingEnabled: { value: 1 },
    // Beta `WorldProvider.generateLightBrightnessTable` var1; the Overworld
    // uses 0.05 and WorldProviderHell raises it to 0.1.
    uAmbientLightFloor: { value: OVERWORLD_AMBIENT_LIGHT_FLOOR },
  };
  material.userData.dynamicLightingUniforms = uniforms;
  material.onBeforeCompile = (shader): void => {
    shader.uniforms.uSkylightSubtracted = uniforms.uSkylightSubtracted;
    shader.uniforms.uSunBrightnessFactor = uniforms.uSunBrightnessFactor;
    shader.uniforms.uTextureMinBrightness = uniforms.uTextureMinBrightness;
    shader.uniforms.uDynamicLightingEnabled = uniforms.uDynamicLightingEnabled;
    shader.uniforms.uAmbientLightFloor = uniforms.uAmbientLightFloor;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec3 tintColor;
        // Normalized uint8x4: x=sky*17, y=block*17, z=ao, w=faceBrightness.
        // Reading .xy back through *15.0 recovers the exact Beta light level
        // because 255/17 == 15 for every one of the 16 discrete levels.
        attribute vec4 packedLight;
        uniform float uSkylightSubtracted;
        uniform float uSunBrightnessFactor;
        uniform float uTextureMinBrightness;
        uniform float uDynamicLightingEnabled;
        uniform float uAmbientLightFloor;
        // Beta WorldProvider.generateLightBrightnessTable:
        //   table[i] = (1 - d) / (d * 3 + 1) * (1 - var1) + var1
        // where d = 1 - i/15 and var1 is the dimension's ambient floor
        // (Overworld 0.05, WorldProviderHell 0.1). The floor is applied HERE,
        // at the light-table/rendering stage, and is never written back as
        // propagated block light, so sealed caves stay dark.
        float betaLightBrightness(float lightLevel) {
          float clamped = clamp(lightLevel, 0.0, 15.0);
          float darkness = 1.0 - clamped / 15.0;
          float base = (1.0 - darkness) / (darkness * 3.0 + 1.0);
          return base * (1.0 - uAmbientLightFloor) + uAmbientLightFloor;
        }`,
      )
      .replace(
        '#include <color_vertex>',
        `#include <color_vertex>
        if (uDynamicLightingEnabled > 0.5) {
          float skyLightLevel = packedLight.x * 15.0;
          float blockLightLevel = packedLight.y * 15.0;
          float aoFactorScalar = packedLight.z;
          float faceBrightness = packedLight.w;
          float effectiveSky = max(0.0, skyLightLevel - uSkylightSubtracted);
          float skyBrightness = betaLightBrightness(effectiveSky) * uSunBrightnessFactor;
          float blockBrightness = betaLightBrightness(blockLightLevel);
          float brightness = max(skyBrightness, blockBrightness);
          float visibility = max(brightness, uTextureMinBrightness) * aoFactorScalar * faceBrightness;
          vColor.xyz = tintColor * visibility;
        }`,
      );
  };
  material.needsUpdate = true;
}

/** Leaf foliage surface opacity (~65%). */
/**
 * Leaf material multiplier stays fully opaque (1.0). Visual density is adjusted
 * by reshaping *texture* alpha: holes stay transparent; semi-see-through foliage
 * pixels are pushed toward opaque so canopies look denser without solid slabs.
 */
export const LEAF_SURFACE_OPACITY = 1.0;

/**
 * Densify leaf atlas alpha after sampling:
 * - alpha near 0 stays discarded (cutout holes)
 * - mid alphas are remapped toward higher opacity
 * Material.opacity remains 1.0 — no global 0.65 surface multiplier.
 */
export function attachLeafFoliageAlpha(material: THREE.MeshBasicMaterial): void {
  const previous = material.onBeforeCompile;
  // densifyPower > 1 lifts mid-alphas; holeThreshold keeps empty texels out
  const uniforms = {
    uLeafAlphaDensify: { value: 0.55 }, // 0 = unchanged, 1 = strong densify
  };
  material.userData.leafFoliageUniforms = uniforms;
  material.transparent = true;
  material.opacity = LEAF_SURFACE_OPACITY;
  material.depthWrite = true;
  material.alphaTest = 0.1;
  material.onBeforeCompile = (shader, renderer): void => {
    if (typeof previous === 'function') {
      previous.call(material, shader, renderer);
    }
    shader.uniforms.uLeafAlphaDensify = uniforms.uLeafAlphaDensify;
    if (!shader.fragmentShader.includes('uLeafAlphaDensify')) {
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
        uniform float uLeafAlphaDensify;`,
        )
        .replace(
          '#include <alphatest_fragment>',
          `// Densify foliage alpha: a' = a + (1-a)*d*a  => keeps 0 at 0, lifts mid-tones
        if (uLeafAlphaDensify > 0.001) {
          float a = diffuseColor.a;
          diffuseColor.a = a + (1.0 - a) * uLeafAlphaDensify * a;
        }
        #include <alphatest_fragment>`,
        );
    }
  };
  material.needsUpdate = true;
}

export function attachEntityLighting(material: THREE.MeshBasicMaterial): void {
  // Every entity material flows through here, so this is the single place
  // that guarantees entities join three.js's OPAQUE queue. Without it a
  // `transparent: true` entity is drawn after the water depth pre-pass and
  // is culled by the water surface (see `useOpaqueEntityQueue`).
  useOpaqueEntityQueue(material);
  const uniforms = {
    uSkylightSubtracted: { value: 0 },
    uSunBrightnessFactor: { value: 1 },
    uTextureMinBrightness: { value: TEXTURE_MIN_BRIGHTNESS },
    uDynamicLightingEnabled: { value: 1 },
    // Entities are lit by the same Beta light table as terrain, so they must
    // pick up the dimension's ambient floor too or mobs would look black in
    // the Nether while the blocks around them do not.
    uAmbientLightFloor: { value: OVERWORLD_AMBIENT_LIGHT_FLOOR },
    uStaticSkyLight: { value: 15.0 },
    uStaticBlockLight: { value: 0.0 },
    uStaticAoFactor: { value: 1.0 },
    uStaticFaceBrightness: { value: 1.0 },
  };
  material.userData.dynamicLightingUniforms = uniforms;
  material.onBeforeCompile = (shader): void => {
    shader.uniforms.uSkylightSubtracted = uniforms.uSkylightSubtracted;
    shader.uniforms.uSunBrightnessFactor = uniforms.uSunBrightnessFactor;
    shader.uniforms.uTextureMinBrightness = uniforms.uTextureMinBrightness;
    shader.uniforms.uDynamicLightingEnabled = uniforms.uDynamicLightingEnabled;
    shader.uniforms.uAmbientLightFloor = uniforms.uAmbientLightFloor;
    shader.uniforms.uStaticSkyLight = uniforms.uStaticSkyLight;
    shader.uniforms.uStaticBlockLight = uniforms.uStaticBlockLight;
    shader.uniforms.uStaticAoFactor = uniforms.uStaticAoFactor;
    shader.uniforms.uStaticFaceBrightness = uniforms.uStaticFaceBrightness;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uSkylightSubtracted;
        uniform float uSunBrightnessFactor;
        uniform float uTextureMinBrightness;
        uniform float uDynamicLightingEnabled;
        uniform float uAmbientLightFloor;

        uniform float uStaticSkyLight;
        uniform float uStaticBlockLight;
        uniform float uStaticAoFactor;
        uniform float uStaticFaceBrightness;

        varying vec3 vEntityLightingFactor;

        // Beta WorldProvider.generateLightBrightnessTable:
        //   table[i] = (1 - d) / (d * 3 + 1) * (1 - var1) + var1
        // where d = 1 - i/15 and var1 is the dimension's ambient floor
        // (Overworld 0.05, WorldProviderHell 0.1). The floor is applied HERE,
        // at the light-table/rendering stage, and is never written back as
        // propagated block light, so sealed caves stay dark.
        float betaLightBrightness(float lightLevel) {
          float clamped = clamp(lightLevel, 0.0, 15.0);
          float darkness = 1.0 - clamped / 15.0;
          float base = (1.0 - darkness) / (darkness * 3.0 + 1.0);
          return base * (1.0 - uAmbientLightFloor) + uAmbientLightFloor;
        }`,
      )
      .replace(
        '#include <color_vertex>',
        `#include <color_vertex>
        vEntityLightingFactor = vec3(1.0);
        if (uDynamicLightingEnabled > 0.5) {
          float effectiveSky = max(0.0, uStaticSkyLight - uSkylightSubtracted);
          float skyBrightness = betaLightBrightness(effectiveSky) * uSunBrightnessFactor;
          float blockBrightness = betaLightBrightness(uStaticBlockLight);
          float brightness = max(skyBrightness, blockBrightness);
          float visibility = max(brightness, uTextureMinBrightness) * uStaticAoFactor * uStaticFaceBrightness;
          vEntityLightingFactor = vec3(visibility);
        }`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vEntityLightingFactor;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb *= vEntityLightingFactor;`,
      );
  };
  material.needsUpdate = true;
}

function attachFluidAnimationShader(material: THREE.MeshBasicMaterial, fluidAnimationSystem: FluidAnimationSystem): void {
  const previous = material.onBeforeCompile;
  const uniforms = {
    uWaterStillTexture: { value: fluidAnimationSystem.waterStillTexture },
    uWaterFlowTexture: { value: fluidAnimationSystem.waterFlowTexture },
    uWaterStillFrame: { value: 0 },
    uWaterFlowFrame: { value: 0 },
    uWaterStillFrameCount: { value: fluidAnimationSystem.waterStillDescriptor.frameCount },
    uWaterFlowFrameCount: { value: fluidAnimationSystem.waterFlowDescriptor.frameCount },
    uWaterFlowBrightness: { value: FLUID_RENDER_SETTINGS.waterFlowBrightness },
  };
  material.userData.fluidAnimationUniforms = uniforms;
  material.onBeforeCompile = (shader): void => {
    previous.call(material, shader, null as never);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float fluidTextureKind;
        attribute vec2 fluidFrameUv;
        varying float vFluidTextureKind;
        varying vec2 vFluidFrameUv;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        vFluidTextureKind = fluidTextureKind;
        vFluidFrameUv = fluidFrameUv;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vFluidTextureKind;
        varying vec2 vFluidFrameUv;
        uniform sampler2D uWaterStillTexture;
        uniform sampler2D uWaterFlowTexture;
        uniform float uWaterStillFrame;
        uniform float uWaterFlowFrame;
        uniform float uWaterStillFrameCount;
        uniform float uWaterFlowFrameCount;
        uniform float uWaterFlowBrightness;
        vec2 fluidFrameUv(vec2 uv, float frame, float frameCount) {
          float frameLocalY = mod(uv.y + frameCount - frame, frameCount);
          return vec2(uv.x, frameLocalY / frameCount);
        }
        vec2 waterFlowFrameUv(vec2 uv, float frame, float frameCount) {
          return vec2(uv.x, mod(uv.y + frame, frameCount) / frameCount);
        }`)
      .replace('#include <map_fragment>', `#ifdef USE_MAP
          vec4 sampledDiffuseColor;
          if (vFluidTextureKind < 0.5) {
            sampledDiffuseColor = texture2D(uWaterStillTexture, fluidFrameUv(vFluidFrameUv, uWaterStillFrame, uWaterStillFrameCount));
          } else {
            sampledDiffuseColor = texture2D(uWaterFlowTexture, waterFlowFrameUv(vFluidFrameUv, uWaterFlowFrame, uWaterFlowFrameCount));
            sampledDiffuseColor.rgb *= uWaterFlowBrightness;
          }
          diffuseColor *= sampledDiffuseColor;
        #endif`);
  };
  material.needsUpdate = true;
}

function attachLavaAnimationShader(material: THREE.MeshBasicMaterial, fluidAnimationSystem: FluidAnimationSystem): void {
  const previous = material.onBeforeCompile;
  const uniforms = {
    uLavaStillTexture: { value: fluidAnimationSystem.lavaStillTexture },
    uLavaFlowTexture: { value: fluidAnimationSystem.lavaFlowTexture },
    uLavaStillFrame: { value: 0 },
    uLavaFlowFrame: { value: 0 },
    uLavaStillFrameCount: { value: fluidAnimationSystem.lavaStillDescriptor.frameCount },
    uLavaFlowFrameCount: { value: fluidAnimationSystem.lavaFlowDescriptor.frameCount },
  };
  material.userData.lavaAnimationUniforms = uniforms;
  material.onBeforeCompile = (shader): void => {
    previous.call(material, shader, null as never);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float fluidTextureKind;
        attribute vec2 fluidFrameUv;
        varying float vFluidTextureKind;
        varying vec2 vFluidFrameUv;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        vFluidTextureKind = fluidTextureKind;
        vFluidFrameUv = fluidFrameUv;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vFluidTextureKind;
        varying vec2 vFluidFrameUv;
        uniform sampler2D uLavaStillTexture;
        uniform sampler2D uLavaFlowTexture;
        uniform float uLavaStillFrame;
        uniform float uLavaFlowFrame;
        uniform float uLavaStillFrameCount;
        uniform float uLavaFlowFrameCount;
        vec2 fluidFrameUv(vec2 uv, float frame, float frameCount) {
          float frameLocalY = mod(uv.y + frameCount - frame, frameCount);
          return vec2(uv.x, frameLocalY / frameCount);
        }`)
      .replace('#include <map_fragment>', `#ifdef USE_MAP
          vec4 sampledDiffuseColor;
          if (vFluidTextureKind < 2.5) {
            sampledDiffuseColor = texture2D(uLavaStillTexture, fluidFrameUv(vFluidFrameUv, uLavaStillFrame, uLavaStillFrameCount));
          } else {
            sampledDiffuseColor = texture2D(uLavaFlowTexture, fluidFrameUv(vFluidFrameUv, uLavaFlowFrame, uLavaFlowFrameCount));
          }
          diffuseColor *= sampledDiffuseColor;
        #endif`);
  };
  material.needsUpdate = true;
}

/**
 * Samples the standalone 32-frame portal strip, selecting the current frame
 * from a uniform. Mirrors the fluid/fire animation shaders: one shared
 * material, one clock, zero geometry rebuilds.
 */
function attachPortalAnimationShader(material: THREE.MeshBasicMaterial, portalAnimation: PortalAnimationSystem): void {
  const previous = material.onBeforeCompile;
  const uniforms = {
    uPortalTexture: { value: portalAnimation.portalTexture },
    uPortalFrame: { value: 0 },
    uPortalFrameCount: { value: portalAnimation.getFrameCount() },
  };
  material.userData.portalAnimationUniforms = uniforms;
  material.onBeforeCompile = (shader, renderer): void => {
    if (typeof previous === 'function') previous.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uPortalTexture;
        uniform float uPortalFrame;
        uniform float uPortalFrameCount;`)
      .replace('#include <map_fragment>', `#ifdef USE_MAP
          // portal.png is a 16x512 vertical strip of 32 frames of 16x16.
          // Geometry emits plain 0..1 UVs covering ONE whole frame, so a
          // frame occupies 1/32 of the strip at offset frameIndex/32:
          //   frameHeight = 1.0 / 32
          //   vOffset     = frameIndex / 32
          // Using fract() keeps the frame fully covered and wrapping safe.
          float portalFrameHeight = 1.0 / uPortalFrameCount;
          float portalVOffset = floor(uPortalFrame) * portalFrameHeight;
          float portalV = portalVOffset + fract(vMapUv.y) * portalFrameHeight;
          vec4 sampledDiffuseColor = texture2D(uPortalTexture, vec2(fract(vMapUv.x), portalV));
          diffuseColor *= sampledDiffuseColor;
        #endif`);
  };
  material.needsUpdate = true;
}

function attachFireAnimationShader(material: THREE.MeshBasicMaterial, fireAnimationSystem: FireAnimationSystem): void {
  const previous = material.onBeforeCompile;
  const uniforms = {
    uFireFrame: { value: 0 },
    uFireFrameCount: { value: fireAnimationSystem.getFrameCount() },
  };
  material.userData.fireAnimationUniforms = uniforms;
  material.onBeforeCompile = (shader): void => {
    previous.call(material, shader, null as never);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float fluidTextureKind;
        attribute vec2 fluidFrameUv;
        varying float vFluidTextureKind;
        varying vec2 vFluidFrameUv;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        vFluidTextureKind = fluidTextureKind;
        vFluidFrameUv = fluidFrameUv;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vFluidTextureKind;
        varying vec2 vFluidFrameUv;
        uniform float uFireFrame;
        uniform float uFireFrameCount;`)
      .replace('#include <map_fragment>', `#ifdef USE_MAP
          float fireFrameY = mod(vFluidFrameUv.y + uFireFrame, uFireFrameCount) / uFireFrameCount;
          vec2 fireUv = vec2(vFluidFrameUv.x, fireFrameY);
          vec4 sampledDiffuseColor = texture2D(map, fireUv);
          if (sampledDiffuseColor.a < 0.1) discard;
          diffuseColor *= sampledDiffuseColor;
        #endif`);
  };
  material.needsUpdate = true;
}

export class ChunkRenderer {
  private readonly chunkManager: ChunkManager;
  private readonly blockRegistry: BlockRegistry;
  private readonly mesher: ChunkMesher;
  private readonly meshQueue: ChunkMeshingQueue;

  private readonly terrainGroup: THREE.Group;
  private readonly cutoutGroup: THREE.Group;
  private readonly leavesGroup: THREE.Group;
  private readonly translucentDepthGroup: THREE.Group;
  private readonly waterDepthGroup: THREE.Group;
  private readonly lavaDepthGroup: THREE.Group;
  private readonly waterGroup: THREE.Group;
  private readonly lavaGroup: THREE.Group;
  private readonly translucentGroup: THREE.Group;
  private readonly fireGroup: THREE.Group;
  private readonly portalGroup: THREE.Group;

  private readonly terrainMaterial: THREE.MeshBasicMaterial;
  private readonly waterMaterial: THREE.MeshBasicMaterial;
  private readonly lavaMaterial: THREE.MeshBasicMaterial;
  private readonly translucentMaterial: THREE.MeshBasicMaterial;
  private readonly cutoutMaterial: THREE.MeshBasicMaterial;
  private readonly leavesMaterial: THREE.MeshBasicMaterial;
  private readonly fireMaterial: THREE.MeshBasicMaterial;
  private readonly portalMaterial: THREE.MeshBasicMaterial;
  private readonly waterDepthMaterial: THREE.MeshBasicMaterial;
  private readonly lavaDepthMaterial: THREE.MeshBasicMaterial;
  private readonly translucentDepthMaterial: THREE.MeshBasicMaterial;

  private readonly terrainMeshes = new Map<number, THREE.Mesh>();
  private readonly waterMeshes = new Map<number, THREE.Mesh>();
  private readonly lavaMeshes = new Map<number, THREE.Mesh>();
  private readonly translucentMeshes = new Map<number, THREE.Mesh>();
  private readonly cutoutMeshes = new Map<number, THREE.Mesh>();
  private readonly leavesMeshes = new Map<number, THREE.Mesh>();
  /** Geometries shared by color+depth meshes; disposed once via pass owner. */
  private readonly ownedPassGeometries = new Map<string, THREE.BufferGeometry>();
  private readonly fireMeshes = new Map<number, THREE.Mesh>();
  private readonly portalMeshes = new Map<number, THREE.Mesh>();
  private readonly waterDepthMeshes = new Map<number, THREE.Mesh>();
  private readonly lavaDepthMeshes = new Map<number, THREE.Mesh>();
  private readonly translucentDepthMeshes = new Map<number, THREE.Mesh>();

  private readonly fluidAnimationSystem: FluidAnimationSystem;
  private readonly fireAnimationSystem: FireAnimationSystem;
  private readonly portalAnimation: PortalAnimationSystem;

  private skylightSubtracted = 0;
  private sunBrightnessFactor = 1;
  /** Active dimension's Beta light-table ambient floor. */
  private ambientLightFloor = OVERWORLD_AMBIENT_LIGHT_FLOOR;
  private meshUploadsThisFrame = 0;
  private lastDirtyScanMs = 0;
  private lastSceneInsertionMs = 0;
  private lastMeshUpdateMs = 0;

  public constructor(
    scene: THREE.Scene,
    chunkManager: ChunkManager,
    blockRegistry: BlockRegistry,
    atlas: TextureAtlas,
    fluidAnimationSystem: FluidAnimationSystem,
    fireAnimationSystem: FireAnimationSystem,
    portalAnimation: PortalAnimationSystem,
    worldSeed: bigint,
  ) {
    this.chunkManager = chunkManager;
    this.blockRegistry = blockRegistry;
    this.mesher = new ChunkMesher(chunkManager, blockRegistry, atlas, new VegetationColorProvider(worldSeed));
    this.meshQueue = new ChunkMeshingQueue(chunkManager, atlas, worldSeed);
    this.fluidAnimationSystem = fluidAnimationSystem;
    this.fireAnimationSystem = fireAnimationSystem;
    this.portalAnimation = portalAnimation;

    this.terrainMaterial = new THREE.MeshBasicMaterial({
      map: atlas.texture,
      vertexColors: true,
      depthWrite: true,
      depthTest: true,
      side: THREE.FrontSide,
    });
    attachHeightAwareFog(this.terrainMaterial);

    this.waterMaterial = new THREE.MeshBasicMaterial({
      map: atlas.texture,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
    });
    attachHeightAwareFog(this.waterMaterial);
    attachFluidAnimationShader(this.waterMaterial, this.fluidAnimationSystem);

    this.lavaMaterial = new THREE.MeshBasicMaterial({
      map: atlas.texture,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
    });
    attachHeightAwareFog(this.lavaMaterial);
    attachLavaAnimationShader(this.lavaMaterial, this.fluidAnimationSystem);

    this.translucentMaterial = new THREE.MeshBasicMaterial({
      map: atlas.texture,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.FrontSide,
      blending: THREE.NormalBlending,
    });
    attachHeightAwareFog(this.translucentMaterial);

    this.cutoutMaterial = new THREE.MeshBasicMaterial({
      map: atlas.texture,
      vertexColors: true,
      alphaTest: 0.5,
      depthWrite: true,
      depthTest: true,
      side: THREE.DoubleSide,
    });
    attachHeightAwareFog(this.cutoutMaterial);
    this.leavesMaterial = new THREE.MeshBasicMaterial({
      map: atlas.texture,
      vertexColors: true,
      alphaTest: 0.1,
      transparent: true,
      opacity: 1,
      depthWrite: true,
      depthTest: true,
      side: THREE.DoubleSide,
    });
    attachHeightAwareFog(this.leavesMaterial);
    attachLeafFoliageAlpha(this.leavesMaterial);

    this.waterDepthMaterial = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: true,
      depthTest: true,
      transparent: false,
      side: THREE.DoubleSide,
    });
    this.lavaDepthMaterial = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: true,
      depthTest: true,
      transparent: false,
      side: THREE.DoubleSide,
    });
    this.translucentDepthMaterial = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: true,
      depthTest: true,
      transparent: false,
      side: THREE.FrontSide,
    });

    this.terrainGroup = new THREE.Group();
    this.terrainGroup.name = 'chunks-terrain';
    this.terrainGroup.renderOrder = RENDER_ORDER.terrain;
    scene.add(this.terrainGroup);

    this.cutoutGroup = new THREE.Group();
    this.cutoutGroup.name = 'chunks-cutouts';
    this.cutoutGroup.renderOrder = RENDER_ORDER.cutout;
    scene.add(this.cutoutGroup);
    this.leavesGroup = new THREE.Group();
    this.leavesGroup.name = 'chunks-leaves';
    this.leavesGroup.renderOrder = RENDER_ORDER.cutout;
    scene.add(this.leavesGroup);

    this.translucentDepthGroup = new THREE.Group();
    this.translucentDepthGroup.name = 'chunks-translucent-depth';
    this.translucentDepthGroup.renderOrder = RENDER_ORDER.translucentDepth;
    scene.add(this.translucentDepthGroup);

    this.waterDepthGroup = new THREE.Group();
    this.waterDepthGroup.name = 'chunks-water-depth';
    this.waterDepthGroup.renderOrder = RENDER_ORDER.translucentDepth;
    scene.add(this.waterDepthGroup);

    this.lavaDepthGroup = new THREE.Group();
    this.lavaDepthGroup.name = 'chunks-lava-depth';
    this.lavaDepthGroup.renderOrder = RENDER_ORDER.translucentDepth;
    scene.add(this.lavaDepthGroup);

    this.translucentGroup = new THREE.Group();
    this.translucentGroup.name = 'chunks-translucent';
    this.translucentGroup.renderOrder = RENDER_ORDER.translucent;
    scene.add(this.translucentGroup);

    this.waterGroup = new THREE.Group();
    this.waterGroup.name = 'chunks-water';
    this.waterGroup.renderOrder = RENDER_ORDER.water;
    scene.add(this.waterGroup);

    this.lavaGroup = new THREE.Group();
    this.lavaGroup.name = 'chunks-lava';
    this.lavaGroup.renderOrder = RENDER_ORDER.lava;
    scene.add(this.lavaGroup);

    this.fireMaterial = new THREE.MeshBasicMaterial({
      map: fireAnimationSystem.fireTexture,
      vertexColors: true,
      alphaTest: 0.5,
      depthWrite: true,
      depthTest: true,
      side: THREE.DoubleSide,
    });
    attachHeightAwareFog(this.fireMaterial);
    attachFireAnimationShader(this.fireMaterial, fireAnimationSystem);

    // Nether portal: its own blended, double-sided, depth-testing pass.
    // Kept separate from fire/translucent because Beta's portal has distinct
    // blending and depth semantics, and the animation is driven by a frame
    // uniform shared by every portal mesh (no per-portal material).
    // Beta draws the portal in alpha pass 1 as a self-illuminated surface: it
    // is NOT modulated by world light (a portal is just as bright in a dark
    // cave as at noon). Attaching the height-aware fog/lighting shader here
    // would multiply it down to near-black at night, and additive blending on
    // top of that made the plane effectively invisible.
    //
    // DoubleSide so the plane is visible from both faces; depthWrite off so it
    // blends against terrain behind it without occluding itself.
    this.portalMaterial = new THREE.MeshBasicMaterial({
      map: portalAnimation.portalTexture,
      vertexColors: false,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
    });
    attachPortalAnimationShader(this.portalMaterial, portalAnimation);

    this.portalGroup = new THREE.Group();
    this.portalGroup.name = 'chunks-portal';
    this.portalGroup.renderOrder = RENDER_ORDER.portal;
    scene.add(this.portalGroup);

    this.fireGroup = new THREE.Group();
    this.fireGroup.name = 'chunks-fire';
    this.fireGroup.renderOrder = 25;
    scene.add(this.fireGroup);
  }

  public update(recentFrameTimeMs = 0, cameraWorldX = 0, cameraWorldZ = 0): void {
    const updateStart = performance.now();
    this.meshUploadsThisFrame = 0;
    this.lastSceneInsertionMs = 0;
    this.updateFluidAnimationUniforms();
    this.updateLavaAnimationUniforms();
    this.updateFireAnimationUniforms();
    this.updatePortalAnimationUniforms();

    if (this.meshQueue.isWorkerEnabled()) {
      const scanStart = performance.now();
      for (const chunk of this.chunkManager.getRenderDirtyChunks()) {
        const cameraChunkX = Math.floor(cameraWorldX / CHUNK_SIZE_X);
        const cameraChunkZ = Math.floor(cameraWorldZ / CHUNK_SIZE_Z);
        const dx = chunk.chunkX - cameraChunkX;
        const dz = chunk.chunkZ - cameraChunkZ;
        const priority = dx * dx + dz * dz;
        this.meshQueue.enqueue(chunk, priority);
      }
      this.lastDirtyScanMs = performance.now() - scanStart;
      this.meshQueue.process();
      // Frame-adaptive upload: prefer stable FPS over max throughput while loading.
      const healthyFrame = recentFrameTimeMs <= 16.5;
      const stressedFrame = recentFrameTimeMs > 22;
      const maxUploads = stressedFrame ? 1 : healthyFrame ? 2 : 1;
      const maxUploadMs = stressedFrame ? 1.5 : healthyFrame ? 3 : 2;
      let uploaded = 0;
      for (const result of this.meshQueue.takeUpload(maxUploads, maxUploadMs)) {
        const sceneStart = performance.now();
        this.applyMeshResult(result);
        this.lastSceneInsertionMs += performance.now() - sceneStart;
        uploaded += 1;
        // Hard stop if a single apply blew the frame (huge forest chunk).
        if (performance.now() - sceneStart > maxUploadMs * 1.5) break;
      }
      void uploaded;
      this.lastMeshUpdateMs = performance.now() - updateStart;
      return;
    }

    let rebuilt = 0;
    const budget = MESH_REBUILD_BUDGET;

    const scanStart = performance.now();
    for (const chunk of this.chunkManager.getRenderDirtyChunks()) {
      this.rebuildChunk(chunk);
      rebuilt += 1;
      if (rebuilt >= budget) break;
    }
    this.lastDirtyScanMs = performance.now() - scanStart;
    this.lastSceneInsertionMs = this.lastDirtyScanMs;
    this.lastMeshUpdateMs = performance.now() - updateStart;
  }

  public setSkylightSubtracted(value: number): void {
    const clamped = THREE.MathUtils.clamp(Math.round(value), 0, 11);
    if (clamped === this.skylightSubtracted) return;
    this.skylightSubtracted = clamped;
    this.updateDynamicLightingUniforms();
  }

  /**
   * Sets the active dimension's ambient light floor (Beta light-table `var1`).
   *
   * This is a RENDERING value only: it lifts the brightness curve so a no-sky
   * dimension is dim rather than black. It is deliberately not fed into the
   * light engine, because injecting it as emission would light sealed caves.
   */
  public setAmbientLightFloor(value: number): void {
    const clamped = THREE.MathUtils.clamp(value, 0, 1);
    if (Math.abs(clamped - this.ambientLightFloor) < 1e-6) return;
    this.ambientLightFloor = clamped;
    this.updateDynamicLightingUniforms();
  }

  /** Current skylight subtraction, for diagnostics. */
  public getSkylightSubtracted(): number {
    return this.skylightSubtracted;
  }

  /** Current dimension ambient light floor, for diagnostics. */
  public getAmbientLightFloor(): number {
    return this.ambientLightFloor;
  }

  public setSunBrightnessFactor(value: number): void {
    const clamped = THREE.MathUtils.clamp(value, 0, 1);
    if (Math.abs(clamped - this.sunBrightnessFactor) < 1e-4) return;
    this.sunBrightnessFactor = clamped;
    this.updateDynamicLightingUniforms();
  }

  public removeChunkMesh(chunkX: number, chunkZ: number): void {
    const key = chunkKey(chunkX, chunkZ);
    // Drop any queued meshing work for a chunk that is going away, so an
    // unloaded chunk cannot still occupy a worker or produce an upload that is
    // discarded on arrival.
    this.meshQueue.cancel(chunkX, chunkZ);
    this.removeSharedPassMeshes(this.waterMeshes, this.waterGroup, this.waterDepthMeshes, this.waterDepthGroup, key, 'water');
    this.removeSharedPassMeshes(this.lavaMeshes, this.lavaGroup, this.lavaDepthMeshes, this.lavaDepthGroup, key, 'lava');
    this.removeSharedPassMeshes(this.translucentMeshes, this.translucentGroup, this.translucentDepthMeshes, this.translucentDepthGroup, key, 'translucent');
    for (const [map, group, pass] of [
      [this.terrainMeshes, this.terrainGroup, 'terrain'],
      [this.cutoutMeshes, this.cutoutGroup, 'cutout'],
      [this.leavesMeshes, this.leavesGroup, 'leaves'],
      [this.fireMeshes, this.fireGroup, 'fire'],
      [this.portalMeshes, this.portalGroup, 'portal'],
    ] as const) {
      const mesh = map.get(key);
      if (mesh !== undefined) {
        group.remove(mesh);
        map.delete(key);
      }
      this.disposeOwnedGeometry(key, pass);
    }
  }

  public dispose(): void {
    this.meshQueue.dispose();
    const allMaps: Array<[Map<number, THREE.Mesh>, THREE.Group]> = [
      [this.terrainMeshes, this.terrainGroup],
      [this.waterMeshes, this.waterGroup],
      [this.lavaMeshes, this.lavaGroup],
      [this.cutoutMeshes, this.cutoutGroup],
      [this.leavesMeshes, this.leavesGroup],
      [this.fireMeshes, this.fireGroup],
      [this.portalMeshes, this.portalGroup],
      [this.translucentMeshes, this.translucentGroup],
      [this.waterDepthMeshes, this.waterDepthGroup],
      [this.lavaDepthMeshes, this.lavaDepthGroup],
      [this.translucentDepthMeshes, this.translucentDepthGroup],
    ];
    for (const [map, group] of allMaps) {
      for (const mesh of map.values()) {
        group.remove(mesh);
        mesh.geometry.dispose();
      }
      map.clear();
    }

    this.terrainMaterial.dispose();
    this.waterMaterial.dispose();
    this.lavaMaterial.dispose();
    this.translucentMaterial.dispose();
    this.cutoutMaterial.dispose();
    this.leavesMaterial.dispose();
    this.fireMaterial.dispose();
    this.portalMaterial.dispose();
    this.waterDepthMaterial.dispose();
    this.lavaDepthMaterial.dispose();
    this.translucentDepthMaterial.dispose();

    this.terrainGroup.removeFromParent();
    this.waterGroup.removeFromParent();
    this.lavaGroup.removeFromParent();
    this.translucentGroup.removeFromParent();
    this.cutoutGroup.removeFromParent();
    this.leavesGroup.removeFromParent();
    this.fireGroup.removeFromParent();
    this.portalGroup.removeFromParent();
    this.waterDepthGroup.removeFromParent();
    this.lavaDepthGroup.removeFromParent();
    this.translucentDepthGroup.removeFromParent();
  }

  public getOpaqueMaterial(): THREE.MeshBasicMaterial {
    return this.terrainMaterial;
  }

  public getBlockRegistry(): BlockRegistry {
    return this.blockRegistry;
  }

  public getVisibleMeshCount(): number {
    return (
      this.terrainMeshes.size +
      this.waterMeshes.size +
      this.lavaMeshes.size +
      this.cutoutMeshes.size +
      this.leavesMeshes.size +
      this.fireMeshes.size +
      this.portalMeshes.size +
      this.translucentMeshes.size
    );
  }

  public getMeshUploadsThisFrame(): number {
    return this.meshUploadsThisFrame;
  }

  public getLastDirtyScanMs(): number {
    return this.lastDirtyScanMs;
  }

  public getLastSceneInsertionMs(): number {
    return this.lastSceneInsertionMs;
  }

  public getLastMeshUpdateMs(): number {
    return this.lastMeshUpdateMs;
  }

  public getLastGeometryCreationMs(): number {
    return this.meshQueue.getStats().geometryCreationMs;
  }

  /**
   * Diagnostic: synchronously mesh a chunk and report each pass's vertex
   * count, so a missing pass can be traced without a browser debugger.
   */
  public probeChunkMesh(chunkX: number, chunkZ: number): Record<string, number> | { error: string } {
    const chunk = this.chunkManager.getChunk(chunkX, chunkZ);
    if (chunk === undefined) return { error: 'chunk not loaded' };
    const mask = computeChunkPassMask(chunk.getBlockDataView(), this.blockRegistry);
    const passes = this.mesher.buildAllPasses(chunk);
    const out: Record<string, number> = { mask };
    for (const [name, geo] of Object.entries(passes)) {
      out[name] = geo.getAttribute('position')?.count ?? 0;
      geo.dispose();
    }
    out.hasPortalBit = (mask & ChunkPassMask.Portal) !== 0 ? 1 : 0;
    return out;
  }

  public getPassMeshCounts(): {
    terrain: number;
    cutout: number;
    water: number;
    lava: number;
    translucent: number;
    fire: number;
    portal: number;
    depth: number;
    stateBuckets: number;
  } {
    const terrain = this.terrainMeshes.size;
    const cutout = this.cutoutMeshes.size + this.leavesMeshes.size;
    const water = this.waterMeshes.size;
    const lava = this.lavaMeshes.size;
    const translucent = this.translucentMeshes.size;
    const fire = this.fireMeshes.size;
    const portal = this.portalMeshes.size;
    const depth = this.translucentDepthMeshes.size + this.waterDepthMeshes.size + this.lavaDepthMeshes.size;
    const stateBuckets = [terrain, cutout, depth, translucent, water, lava, fire, portal].filter((count) => count > 0).length;
    return { terrain, cutout, water, lava, translucent, fire, portal, depth, stateBuckets };
  }

  public getMeshingStats(): ChunkMeshQueueStats {
    return this.meshQueue.getStats();
  }

  public getChunkMeshState(chunkX: number, chunkZ: number): unknown {
    const chunk = this.chunkManager.getChunk(chunkX, chunkZ);
    return {
      blockRevision: chunk?.getBlockRevision() ?? null,
      metadataRevision: chunk?.getMetadataRevision() ?? null,
      lightRevision: chunk?.getLightRevision() ?? null,
      meshRevision: chunk?.getRevision() ?? null,
      queue: this.meshQueue.getChunkState(chunkX, chunkZ),
    };
  }

  public getApproximateGeometryMemoryBytes(): number {
    let total = 0;
    const addGeometry = (geometry: THREE.BufferGeometry): void => {
      for (const attribute of Object.values(geometry.attributes)) {
        total += attribute.array.byteLength;
      }
      const index = geometry.getIndex();
      if (index !== null) total += index.array.byteLength;
    };
    for (const mesh of this.terrainMeshes.values()) addGeometry(mesh.geometry);
    for (const mesh of this.waterMeshes.values()) addGeometry(mesh.geometry);
    for (const mesh of this.lavaMeshes.values()) addGeometry(mesh.geometry);
    for (const mesh of this.cutoutMeshes.values()) addGeometry(mesh.geometry);
    for (const mesh of this.leavesMeshes.values()) addGeometry(mesh.geometry);
    for (const mesh of this.fireMeshes.values()) addGeometry(mesh.geometry);
    for (const mesh of this.portalMeshes.values()) addGeometry(mesh.geometry);
    for (const mesh of this.translucentMeshes.values()) addGeometry(mesh.geometry);
    for (const mesh of this.waterDepthMeshes.values()) addGeometry(mesh.geometry);
    for (const mesh of this.lavaDepthMeshes.values()) addGeometry(mesh.geometry);
    for (const mesh of this.translucentDepthMeshes.values()) addGeometry(mesh.geometry);
    return total;
  }

  private applyMeshResult(result: ChunkMeshGeometrySet): void {
    const chunk = this.chunkManager.getChunk(result.chunkX, result.chunkZ);
    if (chunk === undefined || chunk.getRevision() !== result.targetRevision) {
      result.terrain.dispose();
      result.water.dispose();
      result.lava.dispose();
      result.cutout.dispose();
      result.leaves.dispose();
      result.fire.dispose();
      result.translucent.dispose();
      result.portal.dispose();
      return;
    }

    const key = chunkKey(result.chunkX, result.chunkZ);
    if (RUNTIME_GEOMETRY_VALIDATION_ENABLED && !this.validateGeometrySet(result)) {
      result.terrain.dispose();
      result.water.dispose();
      result.lava.dispose();
      result.cutout.dispose();
      result.leaves.dispose();
      result.fire.dispose();
      result.translucent.dispose();
      result.portal.dispose();
      return;
    }

    this.applyColorModeToGeometry(result.terrain);
    this.upsertMesh(this.terrainMeshes, this.terrainGroup, this.terrainMaterial, chunk, key, result.terrain, 'terrain');

    // Shared geometry for color + depth (no BufferGeometry.clone / second GPU upload).
    this.applyColorModeToGeometry(result.water);
    this.upsertColorDepthPair(chunk, key, result.water, this.waterMeshes, this.waterGroup, this.waterMaterial, this.waterDepthMeshes, this.waterDepthGroup, this.waterDepthMaterial, 'water');
    this.applyColorModeToGeometry(result.lava);
    this.upsertColorDepthPair(chunk, key, result.lava, this.lavaMeshes, this.lavaGroup, this.lavaMaterial, this.lavaDepthMeshes, this.lavaDepthGroup, this.lavaDepthMaterial, 'lava');
    this.applyColorModeToGeometry(result.translucent);
    this.upsertColorDepthPair(chunk, key, result.translucent, this.translucentMeshes, this.translucentGroup, this.translucentMaterial, this.translucentDepthMeshes, this.translucentDepthGroup, this.translucentDepthMaterial, 'translucent');

    this.applyColorModeToGeometry(result.cutout);
    this.upsertMesh(this.cutoutMeshes, this.cutoutGroup, this.cutoutMaterial, chunk, key, result.cutout, 'cutout');
    this.applyColorModeToGeometry(result.leaves);
    this.upsertMesh(this.leavesMeshes, this.leavesGroup, this.leavesMaterial, chunk, key, result.leaves, 'leaves');
    this.applyColorModeToGeometry(result.fire);
    this.upsertMesh(this.fireMeshes, this.fireGroup, this.fireMaterial, chunk, key, result.fire, 'fire');
    this.applyColorModeToGeometry(result.portal);
    this.upsertMesh(this.portalMeshes, this.portalGroup, this.portalMaterial, chunk, key, result.portal, 'portal');

    this.meshQueue.markUploaded(result.chunkX, result.chunkZ, result.targetRevision);
    chunk.markClean();
  }

  private validateGeometrySet(result: ChunkMeshGeometrySet): boolean {
    return (
      this.validateGeometry(result.terrain, false) &&
      this.validateGeometry(result.water, true) &&
      this.validateGeometry(result.lava, true) &&
      this.validateGeometry(result.cutout, false) &&
      this.validateGeometry(result.leaves, false) &&
      this.validateGeometry(result.fire, true) &&
      this.validateGeometry(result.translucent, false)
    );
  }

  private validateGeometry(geometry: THREE.BufferGeometry, fluid: boolean): boolean {
    const position = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (position === undefined) return false;
    const vertexCount = position.count;
    const required: ReadonlyArray<readonly [string, number]> = [
      ['uv', 2],
      ['tintColor', 3],
      ['packedLight', 4],
    ];
    for (const [name] of required) {
      const attr = geometry.getAttribute(name) as THREE.BufferAttribute | undefined;
      if (attr === undefined || attr.count !== vertexCount) return false;
    }
    if (fluid) {
      const selector = geometry.getAttribute('fluidTextureKind') as THREE.BufferAttribute | undefined;
      const frameUv = geometry.getAttribute('fluidFrameUv') as THREE.BufferAttribute | undefined;
      if (selector === undefined || selector.count !== vertexCount) return false;
      if (frameUv === undefined || frameUv.count !== vertexCount) return false;
    }
    for (const attr of Object.values(geometry.attributes)) {
      const array = attr.array as ArrayLike<number>;
      for (let i = 0; i < array.length; i++) if (!Number.isFinite(array[i])) return false;
    }
    const index = geometry.getIndex();
    if (index !== null) {
      const array = index.array as ArrayLike<number>;
      for (let i = 0; i < array.length; i++) {
        const value = array[i]!;
        if (!Number.isFinite(value) || value < 0 || value >= vertexCount) return false;
      }
    }
    return true;
  }

  private rebuildChunk(chunk: Chunk): void {
    const key = chunkKey(chunk.chunkX, chunk.chunkZ);
    const mask = computeChunkPassMask(chunk.getBlockDataView(), this.blockRegistry);

    const terrainGeometry = hasChunkPass(mask, ChunkPassMask.Terrain) ? this.mesher.build(chunk) : createEmptyGeometry(false);
    this.applyColorModeToGeometry(terrainGeometry);
    this.upsertMesh(this.terrainMeshes, this.terrainGroup, this.terrainMaterial, chunk, key, terrainGeometry, 'terrain');

    const waterGeometry = hasChunkPass(mask, ChunkPassMask.Water) ? this.mesher.buildWater(chunk) : createEmptyGeometry(true);
    const lavaGeometry = hasChunkPass(mask, ChunkPassMask.Lava) ? this.mesher.buildLava(chunk) : createEmptyGeometry(true);
    const translucentGeometry = hasChunkPass(mask, ChunkPassMask.Translucent) ? this.mesher.buildTranslucent(chunk) : createEmptyGeometry(false);

    this.applyColorModeToGeometry(waterGeometry);
    this.upsertColorDepthPair(chunk, key, waterGeometry, this.waterMeshes, this.waterGroup, this.waterMaterial, this.waterDepthMeshes, this.waterDepthGroup, this.waterDepthMaterial, 'water');
    this.applyColorModeToGeometry(lavaGeometry);
    this.upsertColorDepthPair(chunk, key, lavaGeometry, this.lavaMeshes, this.lavaGroup, this.lavaMaterial, this.lavaDepthMeshes, this.lavaDepthGroup, this.lavaDepthMaterial, 'lava');
    this.applyColorModeToGeometry(translucentGeometry);
    this.upsertColorDepthPair(chunk, key, translucentGeometry, this.translucentMeshes, this.translucentGroup, this.translucentMaterial, this.translucentDepthMeshes, this.translucentDepthGroup, this.translucentDepthMaterial, 'translucent');

    const cutoutGeometry = hasChunkPass(mask, ChunkPassMask.Cutout) ? this.mesher.buildCutouts(chunk) : createEmptyGeometry(false);
    const leavesGeometry = hasChunkPass(mask, ChunkPassMask.Leaves) ? this.mesher.buildLeaves(chunk) : createEmptyGeometry(false);
    this.applyColorModeToGeometry(cutoutGeometry);
    this.upsertMesh(this.cutoutMeshes, this.cutoutGroup, this.cutoutMaterial, chunk, key, cutoutGeometry, 'cutout');
    this.applyColorModeToGeometry(leavesGeometry);
    this.upsertMesh(this.leavesMeshes, this.leavesGroup, this.leavesMaterial, chunk, key, leavesGeometry, 'leaves');

    const fireGeometry = hasChunkPass(mask, ChunkPassMask.Fire) ? this.mesher.buildFires(chunk) : createEmptyGeometry(true);
    this.applyColorModeToGeometry(fireGeometry);
    this.upsertMesh(this.fireMeshes, this.fireGroup, this.fireMaterial, chunk, key, fireGeometry, 'fire');

    const portalGeometry = hasChunkPass(mask, ChunkPassMask.Portal) ? this.mesher.buildPortals(chunk) : createEmptyGeometry(false);
    this.applyColorModeToGeometry(portalGeometry);
    this.upsertMesh(this.portalMeshes, this.portalGroup, this.portalMaterial, chunk, key, portalGeometry, 'portal');

    chunk.markClean();
  }

  private updateFluidAnimationUniforms(): void {
    const uniforms = this.waterMaterial.userData.fluidAnimationUniforms as {
      uWaterStillTexture: { value: THREE.Texture };
      uWaterFlowTexture: { value: THREE.Texture };
      uWaterStillFrame: { value: number };
      uWaterFlowFrame: { value: number };
      uWaterStillFrameCount: { value: number };
      uWaterFlowFrameCount: { value: number };
      uWaterFlowBrightness: { value: number };
    } | undefined;
    if (uniforms !== undefined) this.fluidAnimationSystem.applyUniforms(uniforms);
  }

  private updateLavaAnimationUniforms(): void {
    const uniforms = this.lavaMaterial.userData.lavaAnimationUniforms as {
      uLavaStillTexture: { value: THREE.Texture };
      uLavaFlowTexture: { value: THREE.Texture };
      uLavaStillFrame: { value: number };
      uLavaFlowFrame: { value: number };
      uLavaStillFrameCount: { value: number };
      uLavaFlowFrameCount: { value: number };
    } | undefined;
    if (uniforms !== undefined) this.fluidAnimationSystem.applyUniforms(uniforms);
  }

  private updateFireAnimationUniforms(): void {
    const uniforms = this.fireMaterial.userData.fireAnimationUniforms as {
      uFireFrame: { value: number };
      uFireFrameCount: { value: number };
    } | undefined;
    if (uniforms !== undefined) {
      uniforms.uFireFrame.value = this.fireAnimationSystem.getFrame();
      uniforms.uFireFrameCount.value = this.fireAnimationSystem.getFrameCount();
    }
  }

  private updatePortalAnimationUniforms(): void {
    const uniforms = this.portalMaterial.userData.portalAnimationUniforms as {
      uPortalTexture: { value: THREE.Texture };
      uPortalFrame: { value: number };
      uPortalFrameCount: { value: number };
    } | undefined;
    if (uniforms !== undefined) this.portalAnimation.applyUniforms(uniforms);
  }

  private updateDynamicLightingUniforms(): void {
    for (const material of [
      this.terrainMaterial,
      this.waterMaterial,
      this.lavaMaterial,
      this.cutoutMaterial,
      this.leavesMaterial,
      this.fireMaterial,
      this.portalMaterial,
      this.translucentMaterial,
    ]) {
      const uniforms = material.userData.dynamicLightingUniforms as {
        uSkylightSubtracted: { value: number };
        uSunBrightnessFactor: { value: number };
        uTextureMinBrightness: { value: number };
        uDynamicLightingEnabled: { value: number };
        uAmbientLightFloor?: { value: number };
      } | undefined;
      if (uniforms === undefined) continue;
      uniforms.uSkylightSubtracted.value = this.skylightSubtracted;
      uniforms.uSunBrightnessFactor.value = this.sunBrightnessFactor;
      uniforms.uTextureMinBrightness.value = TEXTURE_MIN_BRIGHTNESS;
      uniforms.uDynamicLightingEnabled.value = 1;
      if (uniforms.uAmbientLightFloor !== undefined) uniforms.uAmbientLightFloor.value = this.ambientLightFloor;
    }
  }

  /**
   * `vertexColors: true` requires a `color` attribute. The vertex shader
   * recomputes vColor from tintColor x light x AO, so `color` simply aliases
   * `tintColor`: correct as the pre-lighting base and, being an alias, it
   * costs no additional vertex storage or GPU upload.
   */
  private applyColorModeToGeometry(geometry: THREE.BufferGeometry): void {
    const tint = geometry.getAttribute('tintColor');
    if (tint === undefined) throw new Error('Missing geometry colour attribute: tintColor');
    geometry.setAttribute('color', tint);
  }

  private passGeometryKey(chunkKeyValue: number, pass: string): string {
    return `${chunkKeyValue}:${pass}`;
  }

  /** Dispose geometry owned by a chunk pass exactly once. */
  private disposeOwnedGeometry(chunkKeyValue: number, pass: string): void {
    const gk = this.passGeometryKey(chunkKeyValue, pass);
    const geo = this.ownedPassGeometries.get(gk);
    if (geo === undefined) return;
    geo.dispose();
    this.ownedPassGeometries.delete(gk);
  }

  /**
   * Assign conservative analytic bounds for a chunk pass geometry.
   *
   * CRITICAL COORDINATE CONVENTION: the mesher emits vertices in chunk-LOCAL
   * space (x/z in 0..CHUNK_SIZE, y in 0..CHUNK_SIZE_Y) and the world offset is
   * carried by `mesh.position`. Bounding volumes live in the geometry's own
   * (local) space — three.js transforms them by `matrixWorld` when frustum
   * culling. Baking the world offset in here as well double-offsets the sphere
   * by the chunk origin and culls chunks that are still on screen.
   *
   * The margin keeps the volume conservative for passes whose geometry can sit
   * marginally outside the strict block grid (fluid surface insets, fire quads,
   * cross-plant/​shaped models), so a chunk can never vanish while any of its
   * renderable geometry is still inside the view.
   */
  private assignChunkBounds(geometry: THREE.BufferGeometry): void {
    const margin = CHUNK_BOUNDS_MARGIN;
    geometry.boundingBox = new THREE.Box3(
      new THREE.Vector3(-margin, -margin, -margin),
      new THREE.Vector3(CHUNK_SIZE_X + margin, CHUNK_SIZE_Y + margin, CHUNK_SIZE_Z + margin),
    );
    geometry.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(CHUNK_SIZE_X * 0.5, CHUNK_SIZE_Y * 0.5, CHUNK_SIZE_Z * 0.5),
      CHUNK_BOUNDING_SPHERE_RADIUS,
    );
  }

  /**
   * Color + depth meshes share one BufferGeometry (single GPU upload / VRAM copy).
   * Pass owner disposes geometry once when replacing or unloading.
   */
  private upsertColorDepthPair(
    chunk: Chunk,
    key: number,
    geometry: THREE.BufferGeometry,
    colorMeshes: Map<number, THREE.Mesh>,
    colorGroup: THREE.Group,
    colorMaterial: THREE.MeshBasicMaterial,
    depthMeshes: Map<number, THREE.Mesh>,
    depthGroup: THREE.Group,
    depthMaterial: THREE.MeshBasicMaterial,
    pass: string,
  ): void {
    if (geometryIsEmpty(geometry)) {
      geometry.dispose();
      this.removeSharedPassMeshes(colorMeshes, colorGroup, depthMeshes, depthGroup, key, pass);
      return;
    }

    this.disposeOwnedGeometry(key, pass);
    this.assignChunkBounds(geometry);
    this.ownedPassGeometries.set(this.passGeometryKey(key, pass), geometry);

    const place = (map: Map<number, THREE.Mesh>, group: THREE.Group, material: THREE.MeshBasicMaterial, suffix: string): void => {
      let mesh = map.get(key);
      if (mesh !== undefined) {
        // Do not dispose old geometry here — ownedPassGeometries handled it.
        mesh.geometry = geometry;
        mesh.frustumCulled = true;
      } else {
        mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(chunk.chunkX * CHUNK_SIZE_X, 0, chunk.chunkZ * CHUNK_SIZE_Z);
        mesh.name = `chunk_${key}_${suffix}`;
        mesh.renderOrder = group.renderOrder;
        mesh.frustumCulled = true;
        group.add(mesh);
        map.set(key, mesh);
      }
    };

    place(colorMeshes, colorGroup, colorMaterial, pass);
    place(depthMeshes, depthGroup, depthMaterial, `${pass}_depth`);
    this.meshUploadsThisFrame += 1;
  }

  private removeSharedPassMeshes(
    colorMeshes: Map<number, THREE.Mesh>,
    colorGroup: THREE.Group,
    depthMeshes: Map<number, THREE.Mesh>,
    depthGroup: THREE.Group,
    key: number,
    pass: string,
  ): void {
    const color = colorMeshes.get(key);
    if (color !== undefined) {
      colorGroup.remove(color);
      colorMeshes.delete(key);
    }
    const depth = depthMeshes.get(key);
    if (depth !== undefined) {
      depthGroup.remove(depth);
      depthMeshes.delete(key);
    }
    this.disposeOwnedGeometry(key, pass);
  }

  private upsertMesh(
    meshes: Map<number, THREE.Mesh>,
    group: THREE.Group,
    material: THREE.MeshBasicMaterial,
    chunk: Chunk,
    key: number,
    geometry: THREE.BufferGeometry,
    pass = 'mesh',
  ): void {
    if (geometryIsEmpty(geometry)) {
      geometry.dispose();
      const existing = meshes.get(key);
      if (existing !== undefined) {
        group.remove(existing);
        this.disposeOwnedGeometry(key, pass);
        meshes.delete(key);
      }
      return;
    }

    this.disposeOwnedGeometry(key, pass);
    this.assignChunkBounds(geometry);
    this.ownedPassGeometries.set(this.passGeometryKey(key, pass), geometry);

    const existing = meshes.get(key);
    if (existing !== undefined) {
      existing.geometry = geometry;
      existing.frustumCulled = true;
      this.meshUploadsThisFrame += 1;
      return;
    }

    this.meshUploadsThisFrame += 1;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(chunk.chunkX * CHUNK_SIZE_X, 0, chunk.chunkZ * CHUNK_SIZE_Z);
    mesh.name = `chunk_${key}_${pass}`;
    mesh.renderOrder = group.renderOrder;
    mesh.frustumCulled = true;
    group.add(mesh);
    meshes.set(key, mesh);
  }

}
