import * as THREE from 'three';
import type { Chunk } from '../world/Chunk';
import type { ChunkManager } from '../world/ChunkManager';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../world/chunkConstants';
import { ChunkMesher } from './ChunkMesher';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { TextureAtlas } from '../assets/TextureAtlas';

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
  material.userData.heightFogStart = { value: FOG_HEIGHT_START };
  material.userData.heightFogEnd = { value: FOG_HEIGHT_END };
  material.onBeforeCompile = (shader): void => {
    shader.uniforms.uFogHeightStart = material.userData.heightFogStart;
    shader.uniforms.uFogHeightEnd = material.userData.heightFogEnd;

    // Vertex shader: add a world-Y varying alongside Three's existing
    // fog vertex chunk. We compute worldPosition ourselves rather than
    // relying on the `<worldpos_vertex>` chunk, because that chunk is
    // only emitted when specific features are active — this way we
    // stay a strictly additive, dependency-free injection.
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        #ifdef USE_FOG
          varying float vHeightFogWorldY;
        #endif`,
      )
      .replace(
        '#include <fog_vertex>',
        `#include <fog_vertex>
        #ifdef USE_FOG
          vHeightFogWorldY = (modelMatrix * vec4(transformed, 1.0)).y;
        #endif`,
      );

    // Fragment shader: replace Three's stock <fog_fragment> chunk with
    // the same code plus a single-line height-taper multiplication on
    // the fogFactor. This is the minimal change that lets Three's
    // FogExp2/Fog branches keep computing themselves.
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        #ifdef USE_FOG
          varying float vHeightFogWorldY;
          uniform float uFogHeightStart;
          uniform float uFogHeightEnd;
        #endif`,
      )
      .replace(
        '#include <fog_fragment>',
        `
        #ifdef USE_FOG
          #ifdef FOG_EXP2
            float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
          #else
            float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
          #endif
          fogFactor *= 1.0 - smoothstep( uFogHeightStart, uFogHeightEnd, vHeightFogWorldY );
          gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
        #endif
        `,
      );
  };
  // Ensure Three recompiles the shader next render.
  material.needsUpdate = true;
}

/**
 * Beta 1.7.3 voxel brightness curve (Chunk.getLightBrightnessTable).
 * See ChunkMesher.ts for the identical Beta-verbatim justification.
 * The voxel-lighting pipeline itself has no floor.
 */
function getLightBrightness(lightLevel: number): number {
  const clamped = THREE.MathUtils.clamp(lightLevel, 0, 15);
  const darkness = 1 - clamped / 15;
  return (1 - darkness) / (darkness * 3 + 1);
}

/**
 * Stage 16E minimum-visibility floor for the LIGHT MULTIPLIER only.
 * Must stay in sync with the constant in ChunkMesher.ts; both the initial
 * bake there and the dynamic recompute here apply the same floor to the
 * light multiplier BEFORE multiplying by AO — so occluded corners still
 * render darker than exposed surfaces at night. See ChunkMesher.ts's
 * extended comment for the full rationale (root-cause fix of the
 * Stage 16D "flat AO at night" bug).
 */
const TEXTURE_MIN_BRIGHTNESS = 0.015;

/** Owns Three.js chunk meshes and their shared materials. */
export class ChunkRenderer {
  private readonly chunkManager: ChunkManager;
  private readonly mesher: ChunkMesher;
  private readonly terrainGroup: THREE.Group;
  private readonly fluidGroup: THREE.Group;
  private readonly cutoutGroup: THREE.Group;
  private readonly terrainMaterial: THREE.MeshBasicMaterial;
  private readonly fluidMaterial: THREE.MeshBasicMaterial;
  private readonly cutoutMaterial: THREE.MeshBasicMaterial;
  private readonly terrainMeshes = new Map<string, THREE.Mesh>();
  private readonly fluidMeshes = new Map<string, THREE.Mesh>();
  private readonly cutoutMeshes = new Map<string, THREE.Mesh>();
  private readonly atlas: TextureAtlas;

  private rawLightDebugMode = false;
  private ambientOcclusionDebugMode = false;
  private skylightSubtracted = 0;
  private sunBrightnessFactor = 1;

  public constructor(
    scene: THREE.Scene,
    chunkManager: ChunkManager,
    blockRegistry: BlockRegistry,
    atlas: TextureAtlas,
  ) {
    this.chunkManager = chunkManager;
    this.mesher = new ChunkMesher(chunkManager, blockRegistry, atlas);
    this.atlas = atlas;

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
  }

  public update(): void {
    let rebuilt = 0;
    const dirtyCount = this.chunkManager.countDirtyChunks();
    const budget = dirtyCount > 10 ? 32 : MESH_REBUILD_BUDGET;

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
    if (!this.ambientOcclusionDebugMode) {
      this.updateDynamicColorsOnAllMeshes();
    }
  }

  public setSunBrightnessFactor(value: number): void {
    const clamped = THREE.MathUtils.clamp(value, 0, 1);
    if (Math.abs(clamped - this.sunBrightnessFactor) < 1e-4) {
      return;
    }

    this.sunBrightnessFactor = clamped;
    if (!this.ambientOcclusionDebugMode) {
      this.updateDynamicColorsOnAllMeshes();
    }
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
  }

  public dispose(): void {
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

    this.terrainMaterial.dispose();
    this.fluidMaterial.dispose();
    this.cutoutMaterial.dispose();
    this.terrainGroup.removeFromParent();
    this.fluidGroup.removeFromParent();
    this.cutoutGroup.removeFromParent();
  }

  public getVisibleMeshCount(): number {
    return this.terrainMeshes.size + this.fluidMeshes.size + this.cutoutMeshes.size;
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

    chunk.markClean();
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

    this.terrainMaterial.needsUpdate = true;
    this.fluidMaterial.needsUpdate = true;
    this.cutoutMaterial.needsUpdate = true;
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
      return;
    }

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
