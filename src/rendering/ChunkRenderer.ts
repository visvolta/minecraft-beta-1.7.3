import * as THREE from 'three';
import type { Chunk } from '../world/Chunk';
import type { ChunkManager } from '../world/ChunkManager';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../world/chunkConstants';
import { ChunkMesher } from './ChunkMesher';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { TextureAtlas } from '../assets/TextureAtlas';

/** Max dirty chunk meshes rebuilt in a single frame. */
export const MESH_REBUILD_BUDGET = 4;

function getLightBrightness(lightLevel: number): number {
  const clamped = THREE.MathUtils.clamp(lightLevel, 0, 15);
  const darkness = 1 - clamped / 15;
  return ((1 - darkness) / (darkness * 3 + 1)) * 0.95 + 0.05;
}

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

    this.fluidMaterial = new THREE.MeshBasicMaterial({
      map: atlas.texture,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.cutoutMaterial = new THREE.MeshBasicMaterial({
      map: atlas.texture,
      vertexColors: true,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    });

    this.terrainGroup = new THREE.Group();
    this.terrainGroup.name = 'chunks-terrain';
    scene.add(this.terrainGroup);

    this.fluidGroup = new THREE.Group();
    this.fluidGroup.name = 'chunks-fluids';
    scene.add(this.fluidGroup);

    this.cutoutGroup = new THREE.Group();
    this.cutoutGroup.name = 'chunks-cutouts';
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
    const clamped = THREE.MathUtils.clamp(Math.round(value), 0, 13);
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

      normalColor[i * 3] = tint[i * 3]! * shadedBrightness * aoFactor;
      normalColor[i * 3 + 1] = tint[i * 3 + 1]! * shadedBrightness * aoFactor;
      normalColor[i * 3 + 2] = tint[i * 3 + 2]! * shadedBrightness * aoFactor;

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
    group.add(mesh);
    meshes.set(key, mesh);
  }

  private key(chunkX: number, chunkZ: number): string {
    return `${chunkX},${chunkZ}`;
  }
}
