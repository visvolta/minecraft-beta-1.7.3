import * as THREE from 'three';
import type { Chunk } from '../world/Chunk';
import type { ChunkManager } from '../world/ChunkManager';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../world/chunkConstants';
import { ChunkMesher } from './ChunkMesher';
import type { BlockRegistry } from '../blocks/BlockRegistry';

/** Max dirty chunk meshes rebuilt in a single frame. */
export const MESH_REBUILD_BUDGET = 4;

/**
 * Owns Three.js meshes for loaded chunks.
 * Does not own chunk data or decide streaming.
 */
export class ChunkRenderer {
  private readonly chunkManager: ChunkManager;
  private readonly mesher: ChunkMesher;
  private readonly group: THREE.Group;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly meshes = new Map<string, THREE.Mesh>();

  public constructor(
    scene: THREE.Scene,
    chunkManager: ChunkManager,
    blockRegistry: BlockRegistry,
  ) {
    this.chunkManager = chunkManager;
    this.mesher = new ChunkMesher(chunkManager, blockRegistry);

    this.material = new THREE.MeshBasicMaterial({
      vertexColors: true,
    });

    this.group = new THREE.Group();
    this.group.name = 'chunks';
    scene.add(this.group);
  }

  /**
   * Rebuilds up to MESH_REBUILD_BUDGET dirty chunk meshes.
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
    const mesh = this.meshes.get(key);

    if (mesh === undefined) {
      return;
    }

    this.group.remove(mesh);
    mesh.geometry.dispose();
    this.meshes.delete(key);
  }

  public dispose(): void {
    for (const mesh of this.meshes.values()) {
      this.group.remove(mesh);
      mesh.geometry.dispose();
    }

    this.meshes.clear();
    this.material.dispose();
    this.group.removeFromParent();
  }

  private rebuildChunk(chunk: Chunk): void {
    const geometry = this.mesher.build(chunk);
    const key = this.key(chunk.chunkX, chunk.chunkZ);
    const existing = this.meshes.get(key);

    if (existing !== undefined) {
      existing.geometry.dispose();
      existing.geometry = geometry;
    } else {
      const mesh = new THREE.Mesh(geometry, this.material);
      mesh.position.set(
        chunk.chunkX * CHUNK_SIZE_X,
        0,
        chunk.chunkZ * CHUNK_SIZE_Z,
      );
      mesh.name = `chunk_${key}`;
      this.group.add(mesh);
      this.meshes.set(key, mesh);
    }

    chunk.markClean();
  }

  private key(chunkX: number, chunkZ: number): string {
    return `${chunkX},${chunkZ}`;
  }
}
