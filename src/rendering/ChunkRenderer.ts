import * as THREE from 'three';
import { useOpaqueEntityQueue } from './RenderOrder';
import { RENDER_ORDER } from './RenderOrder';
import type { Chunk } from '../world/Chunk';
import type { ChunkManager } from '../world/ChunkManager';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../world/chunkConstants';
import { chunkKey } from '../world/chunkKey';
import { ChunkMesher } from './ChunkMesher';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { TextureAtlas } from '../assets/TextureAtlas';
import { ChunkMeshingQueue, type ChunkMeshQueueStats, type ChunkMeshGeometrySet } from './meshing/ChunkMeshingQueue';
import { ChunkPassMask, computeChunkPassMask, hasChunkPass } from './meshing/ChunkPassMask';
import { getLightBrightness, TEXTURE_MIN_BRIGHTNESS } from './voxelLighting';
import type { FluidAnimationSystem } from './fluid/FluidAnimationSystem';
import { FLUID_RENDER_SETTINGS } from './fluid/FluidRenderSettings';
import type { FireAnimationSystem } from './fire/FireAnimationSystem';
import { VegetationColorProvider } from '../world/generation/climate/VegetationColors';

/** Max dirty chunk meshes rebuilt in a single frame. */
export const MESH_REBUILD_BUDGET = 4;

export const FOG_HEIGHT_START = 62;
export const FOG_HEIGHT_END = 96;
const RUNTIME_GEOMETRY_VALIDATION_ENABLED = typeof import.meta !== 'undefined' && import.meta.env?.DEV === true;

function createEmptyGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(), 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(), 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(), 2));
  geometry.setAttribute('normalColor', new THREE.Float32BufferAttribute(new Float32Array(), 3));
  geometry.setAttribute('debugColor', new THREE.Float32BufferAttribute(new Float32Array(), 3));
  geometry.setAttribute('aoColor', new THREE.Float32BufferAttribute(new Float32Array(), 3));
  geometry.setAttribute('tintColor', new THREE.Float32BufferAttribute(new Float32Array(), 3));
  geometry.setAttribute('skyLightLevel', new THREE.Float32BufferAttribute(new Float32Array(), 1));
  geometry.setAttribute('blockLightLevel', new THREE.Float32BufferAttribute(new Float32Array(), 1));
  geometry.setAttribute('aoFactorScalar', new THREE.Float32BufferAttribute(new Float32Array(), 1));
  geometry.setAttribute('faceBrightness', new THREE.Float32BufferAttribute(new Float32Array(), 1));
  geometry.setAttribute('fluidTextureKind', new THREE.Float32BufferAttribute(new Float32Array(), 1));
  geometry.setAttribute('fluidFrameUv', new THREE.Float32BufferAttribute(new Float32Array(), 2));
  geometry.setAttribute('color', geometry.getAttribute('normalColor'));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(), 1));
  return geometry;
}

function geometryIsEmpty(geometry: THREE.BufferGeometry): boolean {
  const index = geometry.getIndex();
  if (index !== null) return index.count === 0;
  const position = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  return position === undefined || position.count === 0;
}

function createDepthGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const depth = new THREE.BufferGeometry();
  const position = source.getAttribute('position');
  if (position !== undefined) depth.setAttribute('position', position);
  const index = source.getIndex();
  if (index !== null) depth.setIndex(index);
  if (source.boundingBox !== null) depth.boundingBox = source.boundingBox.clone();
  if (source.boundingSphere !== null) depth.boundingSphere = source.boundingSphere.clone();
  return depth;
}

export function attachHeightAwareFog(material: THREE.MeshBasicMaterial): void {
  const uniforms = {
    uSkylightSubtracted: { value: 0 },
    uSunBrightnessFactor: { value: 1 },
    uTextureMinBrightness: { value: TEXTURE_MIN_BRIGHTNESS },
    uDynamicLightingEnabled: { value: 1 },
  };
  material.userData.dynamicLightingUniforms = uniforms;
  material.onBeforeCompile = (shader): void => {
    shader.uniforms.uSkylightSubtracted = uniforms.uSkylightSubtracted;
    shader.uniforms.uSunBrightnessFactor = uniforms.uSunBrightnessFactor;
    shader.uniforms.uTextureMinBrightness = uniforms.uTextureMinBrightness;
    shader.uniforms.uDynamicLightingEnabled = uniforms.uDynamicLightingEnabled;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec3 tintColor;
        attribute float skyLightLevel;
        attribute float blockLightLevel;
        attribute float aoFactorScalar;
        attribute float faceBrightness;
        uniform float uSkylightSubtracted;
        uniform float uSunBrightnessFactor;
        uniform float uTextureMinBrightness;
        uniform float uDynamicLightingEnabled;
        float betaLightBrightness(float lightLevel) {
          float clamped = clamp(lightLevel, 0.0, 15.0);
          float darkness = 1.0 - clamped / 15.0;
          return (1.0 - darkness) / (darkness * 3.0 + 1.0);
        }`,
      )
      .replace(
        '#include <color_vertex>',
        `#include <color_vertex>
        if (uDynamicLightingEnabled > 0.5) {
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
export const LEAF_SURFACE_OPACITY = 1;

/** Multiply cutout/leaf atlas alpha after sampling (keeps alphaTest holes). */
export function attachCutoutOpacity(material: THREE.MeshBasicMaterial, opacity: number): void {
  const previous = material.onBeforeCompile;
  const uniforms = {
    uCutoutOpacity: { value: opacity },
  };
  material.userData.cutoutOpacityUniforms = uniforms;
  material.transparent = opacity < 0.999;
  material.opacity = 1; // per-texel alpha handles it
  material.depthWrite = true;
  material.alphaTest = Math.min(material.alphaTest || 0.5, 0.1);
  material.onBeforeCompile = (shader, renderer): void => {
    if (typeof previous === 'function') previous.call(material, shader, renderer);
    shader.uniforms.uCutoutOpacity = uniforms.uCutoutOpacity;
    if (!shader.fragmentShader.includes('uCutoutOpacity')) {
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
        uniform float uCutoutOpacity;`,
        )
        .replace(
          '#include <alphatest_fragment>',
          `diffuseColor.a *= uCutoutOpacity;
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

        uniform float uStaticSkyLight;
        uniform float uStaticBlockLight;
        uniform float uStaticAoFactor;
        uniform float uStaticFaceBrightness;

        varying vec3 vEntityLightingFactor;

        float betaLightBrightness(float lightLevel) {
          float clamped = clamp(lightLevel, 0.0, 15.0);
          float darkness = 1.0 - clamped / 15.0;
          return (1.0 - darkness) / (darkness * 3.0 + 1.0);
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

  private readonly terrainMaterial: THREE.MeshBasicMaterial;
  private readonly waterMaterial: THREE.MeshBasicMaterial;
  private readonly lavaMaterial: THREE.MeshBasicMaterial;
  private readonly translucentMaterial: THREE.MeshBasicMaterial;
  private readonly cutoutMaterial: THREE.MeshBasicMaterial;
  private readonly leavesMaterial: THREE.MeshBasicMaterial;
  private readonly fireMaterial: THREE.MeshBasicMaterial;
  private readonly waterDepthMaterial: THREE.MeshBasicMaterial;
  private readonly lavaDepthMaterial: THREE.MeshBasicMaterial;
  private readonly translucentDepthMaterial: THREE.MeshBasicMaterial;

  private readonly terrainMeshes = new Map<number, THREE.Mesh>();
  private readonly waterMeshes = new Map<number, THREE.Mesh>();
  private readonly lavaMeshes = new Map<number, THREE.Mesh>();
  private readonly translucentMeshes = new Map<number, THREE.Mesh>();
  private readonly cutoutMeshes = new Map<number, THREE.Mesh>();
  private readonly leavesMeshes = new Map<number, THREE.Mesh>();
  private readonly fireMeshes = new Map<number, THREE.Mesh>();
  private readonly waterDepthMeshes = new Map<number, THREE.Mesh>();
  private readonly lavaDepthMeshes = new Map<number, THREE.Mesh>();
  private readonly translucentDepthMeshes = new Map<number, THREE.Mesh>();

  private readonly atlas: TextureAtlas;
  private readonly fluidAnimationSystem: FluidAnimationSystem;
  private readonly fireAnimationSystem: FireAnimationSystem;

  private rawLightDebugMode = false;
  private ambientOcclusionDebugMode = false;
  private skylightSubtracted = 0;
  private sunBrightnessFactor = 1;
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
    worldSeed: bigint,
  ) {
    this.chunkManager = chunkManager;
    this.blockRegistry = blockRegistry;
    this.mesher = new ChunkMesher(chunkManager, blockRegistry, atlas, new VegetationColorProvider(worldSeed));
    this.meshQueue = new ChunkMeshingQueue(chunkManager, atlas, worldSeed);
    this.atlas = atlas;
    this.fluidAnimationSystem = fluidAnimationSystem;
    this.fireAnimationSystem = fireAnimationSystem;

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
    attachCutoutOpacity(this.leavesMaterial, LEAF_SURFACE_OPACITY);

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

  public setRawLightDebugMode(enabled: boolean): void {
    if (this.rawLightDebugMode === enabled) return;
    this.rawLightDebugMode = enabled;
    if (enabled) this.ambientOcclusionDebugMode = false;
    this.applyDebugModeToAllMeshes();
  }

  public setAmbientOcclusionDebugMode(enabled: boolean): void {
    if (this.ambientOcclusionDebugMode === enabled) return;
    this.ambientOcclusionDebugMode = enabled;
    if (enabled) this.rawLightDebugMode = false;
    this.applyDebugModeToAllMeshes();
  }

  public setSkylightSubtracted(value: number): void {
    const clamped = THREE.MathUtils.clamp(Math.round(value), 0, 11);
    if (clamped === this.skylightSubtracted) return;
    this.skylightSubtracted = clamped;
    this.updateDynamicLightingUniforms();
  }

  public setSunBrightnessFactor(value: number): void {
    const clamped = THREE.MathUtils.clamp(value, 0, 1);
    if (Math.abs(clamped - this.sunBrightnessFactor) < 1e-4) return;
    this.sunBrightnessFactor = clamped;
    this.updateDynamicLightingUniforms();
  }

  public removeChunkMesh(chunkX: number, chunkZ: number): void {
    const key = chunkKey(chunkX, chunkZ);
    const groups: Array<[Map<number, THREE.Mesh>, THREE.Group]> = [
      [this.terrainMeshes, this.terrainGroup],
      [this.waterMeshes, this.waterGroup],
      [this.lavaMeshes, this.lavaGroup],
      [this.cutoutMeshes, this.cutoutGroup],
      [this.leavesMeshes, this.leavesGroup],
      [this.fireMeshes, this.fireGroup],
      [this.translucentMeshes, this.translucentGroup],
      [this.waterDepthMeshes, this.waterDepthGroup],
      [this.lavaDepthMeshes, this.lavaDepthGroup],
      [this.translucentDepthMeshes, this.translucentDepthGroup],
    ];
    for (const [map, group] of groups) {
      const mesh = map.get(key);
      if (mesh !== undefined) {
        group.remove(mesh);
        mesh.geometry.dispose();
        map.delete(key);
      }
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

  public getPassMeshCounts(): {
    terrain: number;
    cutout: number;
    water: number;
    lava: number;
    translucent: number;
    fire: number;
    depth: number;
    stateBuckets: number;
  } {
    const terrain = this.terrainMeshes.size;
    const cutout = this.cutoutMeshes.size + this.leavesMeshes.size;
    const water = this.waterMeshes.size;
    const lava = this.lavaMeshes.size;
    const translucent = this.translucentMeshes.size;
    const fire = this.fireMeshes.size;
    const depth = this.translucentDepthMeshes.size + this.waterDepthMeshes.size + this.lavaDepthMeshes.size;
    const stateBuckets = [terrain, cutout, depth, translucent, water, lava, fire].filter((count) => count > 0).length;
    return { terrain, cutout, water, lava, translucent, fire, depth, stateBuckets };
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
      return;
    }

    this.applyColorModeToGeometry(result.terrain);
    this.upsertMesh(this.terrainMeshes, this.terrainGroup, this.terrainMaterial, chunk, key, result.terrain);
    // Depth clones — same geometry data but separate instances for depth pre-pass.
    // Empty passes are removed instead of retained as zero-geometry meshes.
    if (geometryIsEmpty(result.translucent)) this.removeMesh(this.translucentDepthMeshes, this.translucentDepthGroup, key);
    else this.upsertMesh(this.translucentDepthMeshes, this.translucentDepthGroup, this.translucentDepthMaterial, chunk, key, result.translucent.clone());
    if (geometryIsEmpty(result.water)) this.removeMesh(this.waterDepthMeshes, this.waterDepthGroup, key);
    else this.upsertMesh(this.waterDepthMeshes, this.waterDepthGroup, this.waterDepthMaterial, chunk, key, result.water.clone());
    if (geometryIsEmpty(result.lava)) this.removeMesh(this.lavaDepthMeshes, this.lavaDepthGroup, key);
    else this.upsertMesh(this.lavaDepthMeshes, this.lavaDepthGroup, this.lavaDepthMaterial, chunk, key, result.lava.clone());

    this.applyColorModeToGeometry(result.water);
    this.upsertMesh(this.waterMeshes, this.waterGroup, this.waterMaterial, chunk, key, result.water);
    this.applyColorModeToGeometry(result.lava);
    this.upsertMesh(this.lavaMeshes, this.lavaGroup, this.lavaMaterial, chunk, key, result.lava);
    this.applyColorModeToGeometry(result.cutout);
    this.upsertMesh(this.cutoutMeshes, this.cutoutGroup, this.cutoutMaterial, chunk, key, result.cutout);
    this.applyColorModeToGeometry(result.leaves);
    this.upsertMesh(this.leavesMeshes, this.leavesGroup, this.leavesMaterial, chunk, key, result.leaves);
    this.applyColorModeToGeometry(result.fire);
    this.upsertMesh(this.fireMeshes, this.fireGroup, this.fireMaterial, chunk, key, result.fire);
    this.applyColorModeToGeometry(result.translucent);
    this.upsertMesh(this.translucentMeshes, this.translucentGroup, this.translucentMaterial, chunk, key, result.translucent);

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
      ['normal', 3],
      ['uv', 2],
      ['normalColor', 3],
      ['debugColor', 3],
      ['aoColor', 3],
      ['tintColor', 3],
      ['skyLightLevel', 1],
      ['blockLightLevel', 1],
      ['aoFactorScalar', 1],
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

    const terrainGeometry = hasChunkPass(mask, ChunkPassMask.Terrain) ? this.mesher.build(chunk) : createEmptyGeometry();
    this.applyColorModeToGeometry(terrainGeometry);
    this.upsertMesh(this.terrainMeshes, this.terrainGroup, this.terrainMaterial, chunk, key, terrainGeometry);

    const waterGeometry = hasChunkPass(mask, ChunkPassMask.Water) ? this.mesher.buildWater(chunk) : createEmptyGeometry();
    const lavaGeometry = hasChunkPass(mask, ChunkPassMask.Lava) ? this.mesher.buildLava(chunk) : createEmptyGeometry();
    const translucentGeometry = hasChunkPass(mask, ChunkPassMask.Translucent) ? this.mesher.buildTranslucent(chunk) : createEmptyGeometry();

    // Depth pre-pass — clones, colorWrite false, depthWrite true.
    // Empty passes are removed instead of retained as zero-geometry meshes.
    if (geometryIsEmpty(translucentGeometry)) this.removeMesh(this.translucentDepthMeshes, this.translucentDepthGroup, key);
    else this.upsertMesh(this.translucentDepthMeshes, this.translucentDepthGroup, this.translucentDepthMaterial, chunk, key, translucentGeometry.clone());
    if (geometryIsEmpty(waterGeometry)) this.removeMesh(this.waterDepthMeshes, this.waterDepthGroup, key);
    else this.upsertMesh(this.waterDepthMeshes, this.waterDepthGroup, this.waterDepthMaterial, chunk, key, createDepthGeometry(waterGeometry));
    if (geometryIsEmpty(lavaGeometry)) this.removeMesh(this.lavaDepthMeshes, this.lavaDepthGroup, key);
    else this.upsertMesh(this.lavaDepthMeshes, this.lavaDepthGroup, this.lavaDepthMaterial, chunk, key, lavaGeometry.clone());

    this.applyColorModeToGeometry(waterGeometry);
    this.upsertMesh(this.waterMeshes, this.waterGroup, this.waterMaterial, chunk, key, waterGeometry);

    this.applyColorModeToGeometry(lavaGeometry);
    this.upsertMesh(this.lavaMeshes, this.lavaGroup, this.lavaMaterial, chunk, key, lavaGeometry);

    const cutoutGeometry = hasChunkPass(mask, ChunkPassMask.Cutout) ? this.mesher.buildCutouts(chunk) : createEmptyGeometry();
    const leavesGeometry = hasChunkPass(mask, ChunkPassMask.Leaves) ? this.mesher.buildLeaves(chunk) : createEmptyGeometry();
    this.applyColorModeToGeometry(cutoutGeometry);
    this.upsertMesh(this.cutoutMeshes, this.cutoutGroup, this.cutoutMaterial, chunk, key, cutoutGeometry);
    this.applyColorModeToGeometry(leavesGeometry);
    this.upsertMesh(this.leavesMeshes, this.leavesGroup, this.leavesMaterial, chunk, key, leavesGeometry);

    const fireGeometry = hasChunkPass(mask, ChunkPassMask.Fire) ? this.mesher.buildFires(chunk) : createEmptyGeometry();
    this.applyColorModeToGeometry(fireGeometry);
    this.upsertMesh(this.fireMeshes, this.fireGroup, this.fireMaterial, chunk, key, fireGeometry);

    this.applyColorModeToGeometry(translucentGeometry);
    this.upsertMesh(this.translucentMeshes, this.translucentGroup, this.translucentMaterial, chunk, key, translucentGeometry);

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

  private updateDynamicLightingUniforms(): void {
    for (const material of [
      this.terrainMaterial,
      this.waterMaterial,
      this.lavaMaterial,
      this.cutoutMaterial,
      this.leavesMaterial,
      this.fireMaterial,
      this.translucentMaterial,
    ]) {
      const uniforms = material.userData.dynamicLightingUniforms as {
        uSkylightSubtracted: { value: number };
        uSunBrightnessFactor: { value: number };
        uTextureMinBrightness: { value: number };
        uDynamicLightingEnabled: { value: number };
      } | undefined;
      if (uniforms === undefined) continue;
      uniforms.uSkylightSubtracted.value = this.skylightSubtracted;
      uniforms.uSunBrightnessFactor.value = this.sunBrightnessFactor;
      uniforms.uTextureMinBrightness.value = TEXTURE_MIN_BRIGHTNESS;
      uniforms.uDynamicLightingEnabled.value = this.rawLightDebugMode || this.ambientOcclusionDebugMode ? 0 : 1;
    }
  }

  private applyDebugModeToAllMeshes(): void {
    this.applyMaterialMode();
    this.updateDynamicColorsOnAllMeshes();
    for (const mesh of this.terrainMeshes.values()) this.applyColorModeToGeometry(mesh.geometry);
    for (const mesh of this.waterMeshes.values()) this.applyColorModeToGeometry(mesh.geometry);
    for (const mesh of this.lavaMeshes.values()) this.applyColorModeToGeometry(mesh.geometry);
    for (const mesh of this.cutoutMeshes.values()) this.applyColorModeToGeometry(mesh.geometry);
    for (const mesh of this.leavesMeshes.values()) this.applyColorModeToGeometry(mesh.geometry);
    for (const mesh of this.fireMeshes.values()) this.applyColorModeToGeometry(mesh.geometry);
    for (const mesh of this.translucentMeshes.values()) this.applyColorModeToGeometry(mesh.geometry);
  }

  private updateDynamicColorsOnAllMeshes(): void {
    // No-op in production: sky lighting is uniform-driven in the vertex shader.
    if (!this.rawLightDebugMode && !this.ambientOcclusionDebugMode) return;
    for (const mesh of this.terrainMeshes.values()) this.updateDynamicColorAttributes(mesh.geometry);
    for (const mesh of this.waterMeshes.values()) this.updateDynamicColorAttributes(mesh.geometry);
    for (const mesh of this.lavaMeshes.values()) this.updateDynamicColorAttributes(mesh.geometry);
    for (const mesh of this.cutoutMeshes.values()) this.updateDynamicColorAttributes(mesh.geometry);
    for (const mesh of this.leavesMeshes.values()) this.updateDynamicColorAttributes(mesh.geometry);
    for (const mesh of this.fireMeshes.values()) this.updateDynamicColorAttributes(mesh.geometry);
    for (const mesh of this.translucentMeshes.values()) this.updateDynamicColorAttributes(mesh.geometry);
  }

  private updateDynamicColorAttributes(geometry: THREE.BufferGeometry): void {
    const tintAttribute = geometry.getAttribute('tintColor') as THREE.BufferAttribute | undefined;
    const skyAttribute = geometry.getAttribute('skyLightLevel') as THREE.BufferAttribute | undefined;
    const blockAttribute = geometry.getAttribute('blockLightLevel') as THREE.BufferAttribute | undefined;
    const aoAttribute = geometry.getAttribute('aoFactorScalar') as THREE.BufferAttribute | undefined;
    const normalColorAttribute = geometry.getAttribute('normalColor') as THREE.BufferAttribute | undefined;
    const debugColorAttribute = geometry.getAttribute('debugColor') as THREE.BufferAttribute | undefined;

    if (
      tintAttribute === undefined ||
      skyAttribute === undefined ||
      blockAttribute === undefined ||
      aoAttribute === undefined ||
      normalColorAttribute === undefined ||
      debugColorAttribute === undefined
    )
      return;

    const tint = tintAttribute.array as Float32Array;
    const sky = skyAttribute.array as Float32Array;
    const block = blockAttribute.array as Float32Array;
    const ao = aoAttribute.array as Float32Array;
    const normalColor = normalColorAttribute.array as Float32Array;
    const debugColor = debugColorAttribute.array as Float32Array;

    const vertexCount = skyAttribute.count;
    for (let i = 0; i < vertexCount; i++) {
      const effectiveSky = Math.max(0, sky[i]! - this.skylightSubtracted);
      const skyBrightness = getLightBrightness(effectiveSky) * this.sunBrightnessFactor;
      const blockBrightness = getLightBrightness(block[i]!);
      const shadedBrightness = Math.max(skyBrightness, blockBrightness);
      const rawBrightness = getLightBrightness(Math.max(effectiveSky, block[i]!));
      const aoFactor = ao[i]!;

      const clampedLight = shadedBrightness < TEXTURE_MIN_BRIGHTNESS ? TEXTURE_MIN_BRIGHTNESS : shadedBrightness;
      const visibility = clampedLight * aoFactor;

      normalColor[i * 3] = tint[i * 3]! * visibility;
      normalColor[i * 3 + 1] = tint[i * 3 + 1]! * visibility;
      normalColor[i * 3 + 2] = tint[i * 3 + 2]! * visibility;

      debugColor[i * 3] = rawBrightness;
      debugColor[i * 3 + 1] = rawBrightness;
      debugColor[i * 3 + 2] = rawBrightness;
    }

    normalColorAttribute.needsUpdate = true;
    debugColorAttribute.needsUpdate = true;
  }

  private applyColorModeToGeometry(geometry: THREE.BufferGeometry): void {
    // Production path: vertex shader composes tint × light × AO from attributes + uniforms.
    // Only rewrite CPU colors when a debug visualization mode is active.
    if (this.rawLightDebugMode || this.ambientOcclusionDebugMode) {
      this.updateDynamicColorAttributes(geometry);
    }
    const attributeName = this.rawLightDebugMode ? 'debugColor' : this.ambientOcclusionDebugMode ? 'aoColor' : 'normalColor';
    const colorAttribute = geometry.getAttribute(attributeName);
    if (colorAttribute === undefined) throw new Error(`Missing geometry colour attribute: ${attributeName}`);
    geometry.setAttribute('color', colorAttribute);
  }

  private applyMaterialMode(): void {
    if (this.rawLightDebugMode || this.ambientOcclusionDebugMode) {
      this.terrainMaterial.map = null;
      this.waterMaterial.map = this.atlas.debugTexture;
      this.lavaMaterial.map = this.atlas.debugTexture;
      this.cutoutMaterial.map = this.atlas.debugTexture;
      this.leavesMaterial.map = this.atlas.debugTexture;
      this.translucentMaterial.map = this.atlas.debugTexture;
    } else {
      this.terrainMaterial.map = this.atlas.texture;
      this.waterMaterial.map = this.atlas.texture;
      this.lavaMaterial.map = this.atlas.texture;
      this.cutoutMaterial.map = this.atlas.texture;
      this.leavesMaterial.map = this.atlas.texture;
      this.translucentMaterial.map = this.atlas.texture;
    }

    this.updateDynamicLightingUniforms();
    this.terrainMaterial.needsUpdate = true;
    this.waterMaterial.needsUpdate = true;
    this.lavaMaterial.needsUpdate = true;
    this.cutoutMaterial.needsUpdate = true;
    this.leavesMaterial.needsUpdate = true;
    this.fireMaterial.needsUpdate = true;
    this.translucentMaterial.needsUpdate = true;
  }

  private removeMesh(
    meshes: Map<number, THREE.Mesh>,
    group: THREE.Group,
    key: number,
  ): void {
    const existing = meshes.get(key);
    if (existing === undefined) return;
    group.remove(existing);
    existing.geometry.dispose();
    meshes.delete(key);
  }

  private upsertMesh(
    meshes: Map<number, THREE.Mesh>,
    group: THREE.Group,
    material: THREE.MeshBasicMaterial,
    chunk: Chunk,
    key: number,
    geometry: THREE.BufferGeometry,
  ): void {
    if (geometryIsEmpty(geometry)) {
      geometry.dispose();
      this.removeMesh(meshes, group, key);
      return;
    }

    const existing = meshes.get(key);
    if (existing !== undefined) {
      existing.geometry.dispose();
      existing.geometry = geometry;
      existing.geometry.computeBoundingSphere();
      existing.frustumCulled = true;
      this.meshUploadsThisFrame += 1;
      return;
    }

    this.meshUploadsThisFrame += 1;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(chunk.chunkX * CHUNK_SIZE_X, 0, chunk.chunkZ * CHUNK_SIZE_Z);
    mesh.name = `chunk_${key}`;
    mesh.renderOrder = group.renderOrder;
    group.add(mesh);
    meshes.set(key, mesh);
    mesh.frustumCulled = true;
  }

}
