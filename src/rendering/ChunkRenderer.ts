import * as THREE from 'three';
import type { Chunk } from '../world/Chunk';
import type { ChunkManager } from '../world/ChunkManager';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../world/chunkConstants';
import { ChunkMesher } from './ChunkMesher';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { TextureAtlas } from '../assets/TextureAtlas';
import { ChunkMeshingQueue, type ChunkMeshQueueStats, type ChunkMeshGeometrySet } from './meshing/ChunkMeshingQueue';
import { getLightBrightness, TEXTURE_MIN_BRIGHTNESS } from './voxelLighting';
import type { FluidAnimationSystem } from './fluid/FluidAnimationSystem';
import { FLUID_RENDER_SETTINGS } from './fluid/FluidRenderSettings';
import type { FireAnimationSystem } from './fire/FireAnimationSystem';

/** Max dirty chunk meshes rebuilt in a single frame. */
export const MESH_REBUILD_BUDGET = 4;

/**
 * Stage 17B height-aware fog constants.
 *
 * Terrain materials use Three.js's stock fog (FogExp2 for overworld,
 * Fog for water/lava) but multiply the shader-computed `fogFactor` by
 * `1 - smoothstep(FOG_HEIGHT_START, FOG_HEIGHT_END, worldY)` so:
 *
 *   worldY ≤ FOG_HEIGHT_START : full-strength horizon fog
 *   worldY ≥ FOG_HEIGHT_END   : no fog contribution
 *   between                    : smooth taper
 *
 * Purpose: keep the horizon-fog band concentrated near terrain, so
 * looking upward reveals a clear sky and the cloud layer (Y=108..112)
 * is not washed out by a distant chunk edge's fog.
 *
 * Values chosen so:
 *   FOG_HEIGHT_START = 62  — right around sea level; peaks of low
 *                            hills sit inside the fog band and get the
 *                            expected atmospheric fade.
 *   FOG_HEIGHT_END   = 96  — safely below cloud altitude (108), so the
 *                            cloud layer sees no fog contribution from
 *                            terrain surfaces at any horizontal
 *                            distance. Tall mountains (Y ≥ 96) also
 *                            escape the fog band and read as crisp
 *                            silhouettes against the sky.
 *
 * Weather (future) may want to lower FOG_HEIGHT_END during rain so
 * clouds appear grounded — tuning knobs are exposed here so it's a
 * one-line change.
 */
export const FOG_HEIGHT_START = 62;
export const FOG_HEIGHT_END = 96;

/**
 * Injects a small vertex-fragment shader modification into the passed
 * MeshBasicMaterial so its fog is height-attenuated. Uniforms
 * `uFogHeightStart` / `uFogHeightEnd` are added; a `vHeightFogWorldY`
 * varying carries the world-space Y of each fragment.
 *
 * We reuse Three's own `<fog_fragment>` computation entirely and only
 * multiply the resulting `fogFactor` by the height taper before the
 * final `mix()`.
 */
function attachHeightAwareFog(material: THREE.MeshBasicMaterial): void {
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

function attachFluidAnimationShader(material: THREE.MeshBasicMaterial, fluidAnimationSystem: FluidAnimationSystem): void {
  const previous = material.onBeforeCompile;
  const uniforms = {
    uWaterStillTexture: { value: fluidAnimationSystem.waterStillTexture },
    uWaterFlowTexture: { value: fluidAnimationSystem.waterFlowTexture },
    uLavaStillTexture: { value: fluidAnimationSystem.lavaStillTexture },
    uLavaFlowTexture: { value: fluidAnimationSystem.lavaFlowTexture },
    uWaterStillFrame: { value: 0 },
    uWaterFlowFrame: { value: 0 },
    uLavaStillFrame: { value: 0 },
    uLavaFlowFrame: { value: 0 },
    uWaterStillFrameCount: { value: fluidAnimationSystem.waterStillDescriptor.frameCount },
    uWaterFlowFrameCount: { value: fluidAnimationSystem.waterFlowDescriptor.frameCount },
    uLavaStillFrameCount: { value: fluidAnimationSystem.lavaStillDescriptor.frameCount },
    uLavaFlowFrameCount: { value: fluidAnimationSystem.lavaFlowDescriptor.frameCount },
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
        uniform sampler2D uLavaStillTexture;
        uniform sampler2D uLavaFlowTexture;
        uniform float uWaterStillFrame;
        uniform float uWaterFlowFrame;
        uniform float uLavaStillFrame;
        uniform float uLavaFlowFrame;
        uniform float uWaterStillFrameCount;
        uniform float uWaterFlowFrameCount;
        uniform float uLavaStillFrameCount;
        uniform float uLavaFlowFrameCount;
        uniform float uWaterFlowBrightness;
        vec2 fluidFrameUv(vec2 uv, float frame, float frameCount) {
          // Existing still/lava animation convention. Keep this path
          // unchanged for those selectors.
          float frameLocalY = mod(uv.y + frameCount - frame, frameCount);
          return vec2(uv.x, frameLocalY / frameCount);
        }
        vec2 waterFlowFrameUv(vec2 uv, float frame, float frameCount) {
          // Reverse only flowing water relative to the current direction.
          return vec2(uv.x, mod(uv.y + frame, frameCount) / frameCount);
        }`)
      .replace('#include <map_fragment>', `#ifdef USE_MAP
          vec4 sampledDiffuseColor;
          if (vFluidTextureKind < 0.5) {
            sampledDiffuseColor = texture2D(uWaterStillTexture, fluidFrameUv(vFluidFrameUv, uWaterStillFrame, uWaterStillFrameCount));
          } else if (vFluidTextureKind < 1.5) {
            sampledDiffuseColor = texture2D(uWaterFlowTexture, waterFlowFrameUv(vFluidFrameUv, uWaterFlowFrame, uWaterFlowFrameCount));
            sampledDiffuseColor.rgb *= uWaterFlowBrightness;
          } else if (vFluidTextureKind < 2.5) {
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
      .replace('#include <common>', `#include <common>\n        attribute float fluidTextureKind;\n        attribute vec2 fluidFrameUv;\n        varying float vFluidTextureKind;\n        varying vec2 vFluidFrameUv;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>\n        vFluidTextureKind = fluidTextureKind;\n        vFluidFrameUv = fluidFrameUv;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n        varying float vFluidTextureKind;\n        varying vec2 vFluidFrameUv;\n        uniform float uFireFrame;\n        uniform float uFireFrameCount;`)
      .replace('#include <map_fragment>', `#ifdef USE_MAP\n          // Fire sprite sheet: vertical strip of 16x16 frames\n          // vFluidFrameUv.x = 0-1 within tile, vFluidFrameUv.y = row index (0 or 1)\n          float fireFrameY = (vFluidFrameUv.y + uFireFrame) / uFireFrameCount;\n          vec2 fireUv = vec2(vFluidFrameUv.x, fireFrameY);\n          vec4 sampledDiffuseColor = texture2D(map, fireUv);\n          if (sampledDiffuseColor.a < 0.1) discard;\n          diffuseColor *= sampledDiffuseColor;\n        #endif`);
  };
  material.needsUpdate = true;
}

/** Owns Three.js chunk meshes and their shared materials. */
export class ChunkRenderer {
  private readonly chunkManager: ChunkManager;
  private readonly mesher: ChunkMesher;
  private readonly meshQueue: ChunkMeshingQueue;
  private readonly terrainGroup: THREE.Group;
  private readonly fluidGroup: THREE.Group;
  private readonly cutoutGroup: THREE.Group;
  private readonly fireGroup: THREE.Group;
  private readonly terrainMaterial: THREE.MeshBasicMaterial;
  private readonly fluidMaterial: THREE.MeshBasicMaterial;
  private readonly cutoutMaterial: THREE.MeshBasicMaterial;
  private readonly fireMaterial: THREE.MeshBasicMaterial;
  private readonly terrainMeshes = new Map<string, THREE.Mesh>();
  private readonly fluidMeshes = new Map<string, THREE.Mesh>();
  private readonly cutoutMeshes = new Map<string, THREE.Mesh>();
  private readonly fireMeshes = new Map<string, THREE.Mesh>();
  private readonly atlas: TextureAtlas;
  private readonly fluidAnimationSystem: FluidAnimationSystem;
  private readonly fireAnimationSystem: FireAnimationSystem;

  private rawLightDebugMode = false;
  private ambientOcclusionDebugMode = false;
  private skylightSubtracted = 0;
  private sunBrightnessFactor = 1;
  private meshUploadsThisFrame = 0;

  public constructor(
    scene: THREE.Scene,
    chunkManager: ChunkManager,
    blockRegistry: BlockRegistry,
    atlas: TextureAtlas,
    fluidAnimationSystem: FluidAnimationSystem,
    fireAnimationSystem: FireAnimationSystem,
  ) {
    this.chunkManager = chunkManager;
    this.mesher = new ChunkMesher(chunkManager, blockRegistry, atlas);
    this.meshQueue = new ChunkMeshingQueue(chunkManager, atlas);
    this.atlas = atlas;
    this.fluidAnimationSystem = fluidAnimationSystem;
    this.fireAnimationSystem = fireAnimationSystem;

    this.terrainMaterial = new THREE.MeshBasicMaterial({
      map: atlas.texture,
      vertexColors: true,
    });
    attachHeightAwareFog(this.terrainMaterial);

    this.fluidMaterial = new THREE.MeshBasicMaterial({
      map: atlas.texture,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    attachHeightAwareFog(this.fluidMaterial);
    attachFluidAnimationShader(this.fluidMaterial, this.fluidAnimationSystem);

    this.cutoutMaterial = new THREE.MeshBasicMaterial({ 
      map: atlas.texture,
      vertexColors: true,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    });
    attachHeightAwareFog(this.cutoutMaterial);

    // Stage 17: explicit renderOrder assignment so the transparent
    // queue is deterministic. Opaque terrain at 0 (default), clouds at
    // 10 (see CloudRenderer.ts), water/lava + cutout leaves at 20.
    // Clouds therefore correctly sit BEHIND water surfaces (a cloud
    // reflected in a pond, say, still gets overpainted by the pond) —
    // and clouds are IN FRONT of terrain in the transparent queue,
    // which is what depthTest expects since terrain has already
    // written its depths in the opaque pass.
    this.terrainGroup = new THREE.Group();
    this.terrainGroup.name = 'chunks-terrain';
    this.terrainGroup.renderOrder = 0;
    scene.add(this.terrainGroup);

    this.fluidGroup = new THREE.Group();
    this.fluidGroup.name = 'chunks-fluids';
    this.fluidGroup.renderOrder = 20;
    scene.add(this.fluidGroup);

    this.cutoutGroup = new THREE.Group();
    this.cutoutGroup.name = 'chunks-cutouts';
    this.cutoutGroup.renderOrder = 20;
    scene.add(this.cutoutGroup);

    // Fire material: separate sprite sheet with alpha test, double-sided.
    // Uses the same attribute layout as terrain so lighting/fog works.
    this.fireMaterial = new THREE.MeshBasicMaterial({
      map: fireAnimationSystem.fireTexture,
      vertexColors: true,
      alphaTest: 0.5,
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
    this.meshUploadsThisFrame = 0;
    this.updateFluidAnimationUniforms();
    this.updateFireAnimationUniforms();

    if (this.meshQueue.isWorkerEnabled()) {
      for (const chunk of this.chunkManager) {
        if (!chunk.isDirty()) continue;
        const cameraChunkX = Math.floor(cameraWorldX / CHUNK_SIZE_X);
        const cameraChunkZ = Math.floor(cameraWorldZ / CHUNK_SIZE_Z);
        const dx = chunk.chunkX - cameraChunkX;
        const dz = chunk.chunkZ - cameraChunkZ;
        const priority = dx * dx + dz * dz;
        this.meshQueue.enqueue(chunk, priority);
      }
      this.meshQueue.process();
      const healthyFrame = recentFrameTimeMs <= 18;
      const maxUploads = healthyFrame ? 2 : 1;
      const maxUploadMs = healthyFrame ? 4 : 2;
      for (const result of this.meshQueue.takeUpload(maxUploads, maxUploadMs)) {
        this.applyMeshResult(result);
      }
      return;
    }

    let rebuilt = 0;
    const budget = MESH_REBUILD_BUDGET;

    for (const chunk of this.chunkManager) {
      if (!chunk.isDirty()) {
        continue;
      }

      this.rebuildChunk(chunk);
      rebuilt += 1;

      if (rebuilt >= budget) {
        break;
      }
    }
  }

  public setRawLightDebugMode(enabled: boolean): void {
    if (this.rawLightDebugMode === enabled) {
      return;
    }

    this.rawLightDebugMode = enabled;
    if (enabled) {
      this.ambientOcclusionDebugMode = false;
    }
    this.applyDebugModeToAllMeshes();
  }

  public setAmbientOcclusionDebugMode(enabled: boolean): void {
    if (this.ambientOcclusionDebugMode === enabled) {
      return;
    }

    this.ambientOcclusionDebugMode = enabled;
    if (enabled) {
      this.rawLightDebugMode = false;
    }
    this.applyDebugModeToAllMeshes();
  }

  /**
   * Applies the current global skylight subtraction (0-11). Updates only
   * vertex colours, never geometry topology, so no chunk remesh is needed.
   */
  public setSkylightSubtracted(value: number): void {
    // Beta caps at 11 (see WorldTime.getSkylightSubtracted). Was 13 here,
    // a 2-level deviation that kept outdoor terrain systematically
    // brighter at night than Beta.
    const clamped = THREE.MathUtils.clamp(Math.round(value), 0, 11);
    if (clamped === this.skylightSubtracted) {
      return;
    }

    this.skylightSubtracted = clamped;
    this.updateDynamicLightingUniforms();
  }

  public setSunBrightnessFactor(value: number): void {
    const clamped = THREE.MathUtils.clamp(value, 0, 1);
    if (Math.abs(clamped - this.sunBrightnessFactor) < 1e-4) {
      return;
    }

    this.sunBrightnessFactor = clamped;
    this.updateDynamicLightingUniforms();
  }

  public removeChunkMesh(chunkX: number, chunkZ: number): void {
    const key = this.key(chunkX, chunkZ);

    const terrainMesh = this.terrainMeshes.get(key);
    if (terrainMesh !== undefined) {
      this.terrainGroup.remove(terrainMesh);
      terrainMesh.geometry.dispose();
      this.terrainMeshes.delete(key);
    }

    const fluidMesh = this.fluidMeshes.get(key);
    if (fluidMesh !== undefined) {
      this.fluidGroup.remove(fluidMesh);
      fluidMesh.geometry.dispose();
      this.fluidMeshes.delete(key);
    }

    const cutoutMesh = this.cutoutMeshes.get(key);
    if (cutoutMesh !== undefined) {
      this.cutoutGroup.remove(cutoutMesh);
      cutoutMesh.geometry.dispose();
      this.cutoutMeshes.delete(key);
    }

    const fireMesh = this.fireMeshes.get(key);
    if (fireMesh !== undefined) {
      this.fireGroup.remove(fireMesh);
      fireMesh.geometry.dispose();
      this.fireMeshes.delete(key);
    }
  }

  public dispose(): void {
    this.meshQueue.dispose();
    for (const mesh of this.terrainMeshes.values()) {
      this.terrainGroup.remove(mesh);
      mesh.geometry.dispose();
    }
    this.terrainMeshes.clear();

    for (const mesh of this.fluidMeshes.values()) {
      this.fluidGroup.remove(mesh);
      mesh.geometry.dispose();
    }
    this.fluidMeshes.clear();

    for (const mesh of this.cutoutMeshes.values()) {
      this.cutoutGroup.remove(mesh);
      mesh.geometry.dispose();
    }
    this.cutoutMeshes.clear();

    for (const mesh of this.fireMeshes.values()) {
      this.fireGroup.remove(mesh);
      mesh.geometry.dispose();
    }
    this.fireMeshes.clear();

    this.terrainMaterial.dispose();
    this.fluidMaterial.dispose();
    this.cutoutMaterial.dispose();
    this.fireMaterial.dispose();
    this.terrainGroup.removeFromParent();
    this.fluidGroup.removeFromParent();
    this.cutoutGroup.removeFromParent();
    this.fireGroup.removeFromParent();
  }

  public getVisibleMeshCount(): number {
    return this.terrainMeshes.size + this.fluidMeshes.size + this.cutoutMeshes.size + this.fireMeshes.size;
  }

  public getMeshUploadsThisFrame(): number {
    return this.meshUploadsThisFrame;
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
      if (index !== null) {
        total += index.array.byteLength;
      }
    };
    for (const mesh of this.terrainMeshes.values()) addGeometry(mesh.geometry);
    for (const mesh of this.fluidMeshes.values()) addGeometry(mesh.geometry);
    for (const mesh of this.cutoutMeshes.values()) addGeometry(mesh.geometry);
    return total;
  }

  private applyMeshResult(result: ChunkMeshGeometrySet): void {
    const chunk = this.chunkManager.getChunk(result.chunkX, result.chunkZ);
    if (chunk === undefined || chunk.getRevision() !== result.targetRevision) {
      result.terrain.dispose();
      result.fluid.dispose();
      result.cutout.dispose();
      result.fire.dispose();
      return;
    }

    const key = this.key(result.chunkX, result.chunkZ);
    if (!this.validateGeometrySet(result)) {
      result.terrain.dispose();
      result.fluid.dispose();
      result.cutout.dispose();
      result.fire.dispose();
      return;
    }
    this.applyColorModeToGeometry(result.terrain);
    this.upsertMesh(this.terrainMeshes, this.terrainGroup, this.terrainMaterial, chunk, key, result.terrain);
    this.applyColorModeToGeometry(result.fluid);
    this.upsertMesh(this.fluidMeshes, this.fluidGroup, this.fluidMaterial, chunk, key, result.fluid);
    this.applyColorModeToGeometry(result.cutout);
    this.upsertMesh(this.cutoutMeshes, this.cutoutGroup, this.cutoutMaterial, chunk, key, result.cutout);
    this.applyColorModeToGeometry(result.fire);
    this.upsertMesh(this.fireMeshes, this.fireGroup, this.fireMaterial, chunk, key, result.fire);
    this.meshQueue.markUploaded(result.chunkX, result.chunkZ, result.targetRevision);
    chunk.markClean();
  }

  private validateGeometrySet(result: ChunkMeshGeometrySet): boolean {
    return this.validateGeometry(result.terrain, false)
      && this.validateGeometry(result.fluid, true)
      && this.validateGeometry(result.cutout, false)
      && this.validateGeometry(result.fire, true);
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
      for (let i = 0; i < array.length; i++) {
        if (!Number.isFinite(array[i])) return false;
      }
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
    const key = this.key(chunk.chunkX, chunk.chunkZ);

    const terrainGeometry = this.mesher.build(chunk);
    this.applyColorModeToGeometry(terrainGeometry);
    this.upsertMesh(this.terrainMeshes, this.terrainGroup, this.terrainMaterial, chunk, key, terrainGeometry);

    const fluidGeometry = this.mesher.buildFluids(chunk);
    this.applyColorModeToGeometry(fluidGeometry);
    this.upsertMesh(this.fluidMeshes, this.fluidGroup, this.fluidMaterial, chunk, key, fluidGeometry);

    const cutoutGeometry = this.mesher.buildCutouts(chunk);
    this.applyColorModeToGeometry(cutoutGeometry);
    this.upsertMesh(this.cutoutMeshes, this.cutoutGroup, this.cutoutMaterial, chunk, key, cutoutGeometry);

    const fireGeometry = this.mesher.buildFires(chunk);
    this.applyColorModeToGeometry(fireGeometry);
    this.upsertMesh(this.fireMeshes, this.fireGroup, this.fireMaterial, chunk, key, fireGeometry);

    chunk.markClean();
  }

  private updateFluidAnimationUniforms(): void {
    const uniforms = this.fluidMaterial.userData.fluidAnimationUniforms as {
      uWaterStillTexture: { value: THREE.Texture };
      uWaterFlowTexture: { value: THREE.Texture };
      uLavaStillTexture: { value: THREE.Texture };
      uLavaFlowTexture: { value: THREE.Texture };
      uWaterStillFrame: { value: number };
      uWaterFlowFrame: { value: number };
      uLavaStillFrame: { value: number };
      uLavaFlowFrame: { value: number };
      uWaterStillFrameCount: { value: number };
      uWaterFlowFrameCount: { value: number };
      uLavaStillFrameCount: { value: number };
      uLavaFlowFrameCount: { value: number };
    } | undefined;
    if (uniforms !== undefined) {
      this.fluidAnimationSystem.applyUniforms(uniforms);
    }
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
    for (const material of [this.terrainMaterial, this.fluidMaterial, this.cutoutMaterial, this.fireMaterial]) {
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
    for (const mesh of this.terrainMeshes.values()) {
      this.applyColorModeToGeometry(mesh.geometry);
    }
    for (const mesh of this.fluidMeshes.values()) {
      this.applyColorModeToGeometry(mesh.geometry);
    }
    for (const mesh of this.cutoutMeshes.values()) {
      this.applyColorModeToGeometry(mesh.geometry);
    }
    for (const mesh of this.fireMeshes.values()) {
      this.applyColorModeToGeometry(mesh.geometry);
    }
  }

  private updateDynamicColorsOnAllMeshes(): void {
    for (const mesh of this.terrainMeshes.values()) {
      this.updateDynamicColorAttributes(mesh.geometry);
    }
    for (const mesh of this.fluidMeshes.values()) {
      this.updateDynamicColorAttributes(mesh.geometry);
    }
    for (const mesh of this.cutoutMeshes.values()) {
      this.updateDynamicColorAttributes(mesh.geometry);
    }
    for (const mesh of this.fireMeshes.values()) {
      this.updateDynamicColorAttributes(mesh.geometry);
    }
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
    ) {
      return;
    }

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

      // Stage 16E: floor the LIGHT multiplier alone, then multiply by
      // AO. Prior Stage 16D order `max(brightness*ao, floor)` flattened
      // AO at night because both an exposed and a fully-occluded corner
      // clamped to the same floor. This ordering preserves AO contrast:
      //
      //   occluded corner (ao=0.4, brightness≈0): floor * 0.4 ≈ 0.006
      //   exposed surface (ao=1.0, brightness≈0): floor * 1.0 = 0.015
      //
      // Voxel light, AO factor, tint, and sun factor remain untouched.
      const clampedLight =
        shadedBrightness < TEXTURE_MIN_BRIGHTNESS ? TEXTURE_MIN_BRIGHTNESS : shadedBrightness;
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
    if (!this.ambientOcclusionDebugMode) {
      this.updateDynamicColorAttributes(geometry);
    }

    const attributeName = this.rawLightDebugMode
      ? 'debugColor'
      : this.ambientOcclusionDebugMode
        ? 'aoColor'
        : 'normalColor';
    const colorAttribute = geometry.getAttribute(attributeName);

    if (colorAttribute === undefined) {
      throw new Error(`Missing geometry colour attribute: ${attributeName}`);
    }

    geometry.setAttribute('color', colorAttribute);
    geometry.getAttribute('color').needsUpdate = true;
  }

  private applyMaterialMode(): void {
    if (this.rawLightDebugMode || this.ambientOcclusionDebugMode) {
      this.terrainMaterial.map = null;
      this.fluidMaterial.map = this.atlas.debugTexture;
      this.cutoutMaterial.map = this.atlas.debugTexture;
    } else {
      this.terrainMaterial.map = this.atlas.texture;
      this.fluidMaterial.map = this.atlas.texture;
      this.cutoutMaterial.map = this.atlas.texture;
    }

    this.updateDynamicLightingUniforms();
    this.terrainMaterial.needsUpdate = true;
    this.fluidMaterial.needsUpdate = true;
    this.cutoutMaterial.needsUpdate = true;
    this.fireMaterial.needsUpdate = true;
  }

  private upsertMesh(
    meshes: Map<string, THREE.Mesh>,
    group: THREE.Group,
    material: THREE.MeshBasicMaterial,
    chunk: Chunk,
    key: string,
    geometry: THREE.BufferGeometry,
  ): void {
    const existing = meshes.get(key);

    if (existing !== undefined) {
      existing.geometry.dispose();
      existing.geometry = geometry;
      this.meshUploadsThisFrame += 1;
      return;
    }

    this.meshUploadsThisFrame += 1;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(chunk.chunkX * CHUNK_SIZE_X, 0, chunk.chunkZ * CHUNK_SIZE_Z);
    mesh.name = `chunk_${key}`;
    // Stage 17: per-mesh renderOrder mirrors the group's so Three's
    // transparent-queue sorter picks it up (group.renderOrder alone
    // does NOT propagate to children when the sort runs).
    mesh.renderOrder = group.renderOrder;
    group.add(mesh);
    meshes.set(key, mesh);
  }

  private key(chunkX: number, chunkZ: number): string {
    return `${chunkX},${chunkZ}`;
  }
}
