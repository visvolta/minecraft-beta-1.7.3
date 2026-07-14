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
 * Owns Three.js meshes for loaded chunks: one opaque terrain mesh and one
 * still-fluid mesh (Water and, since Stage 12B, cave-generated Lava) per
 * chunk, both sharing a single material instance across the whole world
 * (never one material per chunk). Does not own chunk data or decide
 * streaming.
 */
export class ChunkRenderer {
  private readonly chunkManager: ChunkManager;
  private readonly mesher: ChunkMesher;
  private readonly terrainGroup: THREE.Group;
  private readonly fluidGroup: THREE.Group;
  private readonly terrainMaterial: THREE.MeshBasicMaterial;
  private readonly fluidMaterial: THREE.MeshBasicMaterial;
  private readonly terrainMeshes = new Map<string, THREE.Mesh>();
  private readonly fluidMeshes = new Map<string, THREE.Mesh>();

  public constructor(
    scene: THREE.Scene,
    chunkManager: ChunkManager,
    blockRegistry: BlockRegistry,
    atlas: TextureAtlas,
  ) {
    this.chunkManager = chunkManager;
    this.mesher = new ChunkMesher(chunkManager, blockRegistry, atlas);

    // One shared, atlas-textured material for every opaque chunk mesh.
    // vertexColors carries the per-face tint multiplier (white = untinted).
    this.terrainMaterial = new THREE.MeshBasicMaterial({
      map: atlas.texture,
      vertexColors: true,
    });

    // One shared, atlas-textured, transparent material for every fluid
    // mesh (Water and Lava both use it — same still, non-animated
    // meshing/material treatment, only their per-block texture differs
    // via the atlas UVs baked into each mesh's geometry). The water
    // texture itself already carries partial alpha (Beta's water.png is
    // ~67-87% opaque), so `transparent: true` lets that alpha drive
    // translucency directly — material `opacity` is left at its default
    // (1) rather than compounding a second transparency multiplier on
    // top of the texture's own alpha. depthWrite is disabled (standard
    // Three.js transparency practice) so overlapping transparent fluid
    // faces don't occlude each other based on draw order; the opaque
    // terrain mesh (drawn via its own, separate, opaque material) still
    // writes depth normally, so fluids always render above terrain
    // correctly.
    this.fluidMaterial = new THREE.MeshBasicMaterial({
      map: atlas.texture,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.terrainGroup = new THREE.Group();
    this.terrainGroup.name = 'chunks-terrain';
    scene.add(this.terrainGroup);

    // Added after the terrain group so fluids render after (on top of)
    // opaque terrain in Three.js's default back-to-front scene-graph
    // traversal for same-depth transparent objects, per Stage 12D's
    // "render terrain, then render water" requirement (now covering
    // Lava too). Both groups sit in the same scene/camera pass — no
    // second camera or render call.
    this.fluidGroup = new THREE.Group();
    this.fluidGroup.name = 'chunks-fluids';
    scene.add(this.fluidGroup);
  }

  /**
   * Rebuilds up to MESH_REBUILD_BUDGET dirty chunks (each rebuild
   * regenerates both the chunk's opaque and fluid meshes together).
   */
  public update(): void {
    let rebuilt = 0;

    for (const chunk of this.chunkManager) {
      if (!chunk.isDirty()) {
        continue;
      }

      this.rebuildChunk(chunk);
      rebuilt += 1;

      if (rebuilt >= MESH_REBUILD_BUDGET) {
        break;
      }
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

    this.terrainMaterial.dispose();
    this.fluidMaterial.dispose();
    this.terrainGroup.removeFromParent();
    this.fluidGroup.removeFromParent();
  }

  /** Number of currently loaded terrain chunk meshes (debug-overlay use). */
  public getVisibleMeshCount(): number {
    return this.terrainMeshes.size + this.fluidMeshes.size;
  }

  private rebuildChunk(chunk: Chunk): void {
    const key = this.key(chunk.chunkX, chunk.chunkZ);

    const terrainGeometry = this.mesher.build(chunk);
    this.upsertMesh(this.terrainMeshes, this.terrainGroup, this.terrainMaterial, chunk, key, terrainGeometry);

    const fluidGeometry = this.mesher.buildFluids(chunk);
    this.upsertMesh(this.fluidMeshes, this.fluidGroup, this.fluidMaterial, chunk, key, fluidGeometry);

    chunk.markClean();
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
