import * as THREE from 'three';
import type { TextureAtlas } from '../assets/TextureAtlas';
import { BlockRegistry } from '../blocks/BlockRegistry';
import type { BlockUpdateWorld } from '../world/BlockUpdateWorld';
import { BlockIds } from '../blocks/BlockId';

const SURFACE_OFFSET = 0.002;

interface FaceDef {
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly dx: number;
  readonly dy: number;
  readonly dz: number;
  readonly corners: readonly [
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number]
  ];
}

const FACES: readonly FaceDef[] = [
  {
    nx: 1, ny: 0, nz: 0,
    dx: 1, dy: 0, dz: 0,
    corners: [
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
      [1, 0, 1],
    ],
  },
  {
    nx: -1, ny: 0, nz: 0,
    dx: -1, dy: 0, dz: 0,
    corners: [
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
      [0, 0, 0],
    ],
  },
  {
    nx: 0, ny: 1, nz: 0,
    dx: 0, dy: 1, dz: 0,
    corners: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ],
  },
  {
    nx: 0, ny: -1, nz: 0,
    dx: 0, dy: -1, dz: 0,
    corners: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
  },
  {
    nx: 0, ny: 0, nz: 1,
    dx: 0, dy: 0, dz: 1,
    corners: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
  },
  {
    nx: 0, ny: 0, nz: -1,
    dx: 0, dy: 0, dz: -1,
    corners: [
      [0, 1, 0],
      [1, 1, 0],
      [1, 0, 0],
      [0, 0, 0],
    ],
  },
];

/**
 * Re-creates the exact corner-to-texture-UV mapping from ChunkMesher
 * to guarantee that the cracks always orient and align perfectly with
 * the base block textures.
 */
function localCornerToTextureUv(face: FaceDef, corner: readonly [number, number, number]): readonly [number, number] {
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

export class DestroyOverlayRenderer {
  private readonly scene: THREE.Scene;
  private readonly atlas: TextureAtlas;
  private readonly blockRegistry: BlockRegistry;
  private readonly blockUpdateWorld: BlockUpdateWorld;

  private readonly mesh: THREE.Mesh;
  private geometry: THREE.BufferGeometry;
  private readonly material: THREE.MeshBasicMaterial;

  private lastBlockPosKey = '';
  private lastStage = -1;

  public constructor(
    scene: THREE.Scene,
    atlas: TextureAtlas,
    blockRegistry: BlockRegistry,
    blockUpdateWorld: BlockUpdateWorld,
  ) {
    this.scene = scene;
    this.atlas = atlas;
    this.blockRegistry = blockRegistry;
    this.blockUpdateWorld = blockUpdateWorld;

    // Pre-initialize geometry with position and uv attributes of size 0
    // This forces Three.js to compile the basic material's WebGL program with USE_UV
    // enabled right from the very first frame, permanently eliminating the 1-frame fire_layer_0 flash.
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(0), 2));

    this.material = new THREE.MeshBasicMaterial({
      map: atlas.texture,
      transparent: true,
      blending: THREE.MultiplyBlending, // Multiply blending matches Beta 1.7.3 crack rendering overlay
      premultipliedAlpha: true, // Silences WebGLState MultiplyBlending warning
      depthWrite: false,
      alphaTest: 0.01,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'destroyOverlay';
    this.mesh.visible = false;
    this.scene.add(this.mesh);
  }

  /**
   * Updates the overlay geometry and visibility based on active mining.
   */
  public update(
    blockPos: { x: number; y: number; z: number } | undefined,
    progress: number,
  ): void {
    if (blockPos === undefined || progress <= 0.0 || progress >= 1.0) {
      this.mesh.visible = false;
      this.lastBlockPosKey = '';
      this.lastStage = -1;
      return;
    }

    const stage = Math.min(9, Math.max(0, Math.floor(progress * 10.0)));
    const blockPosKey = `${blockPos.x},${blockPos.y},${blockPos.z}`;

    // If block position or stage changes, rebuild the geometry
    if (this.lastBlockPosKey !== blockPosKey || this.lastStage !== stage) {
      this.rebuildGeometry(blockPos, stage);
      this.lastBlockPosKey = blockPosKey;
      this.lastStage = stage;
    }

    // Explicitly set mesh position to the targeted block (local coordinates in geometry)
    this.mesh.position.set(blockPos.x, blockPos.y, blockPos.z);
    this.mesh.visible = true;
  }

  private rebuildGeometry(blockPos: { x: number; y: number; z: number }, stage: number): void {
    // Cleanly dispose of old geometry to prevent memory leaks in Three.js
    this.geometry.dispose();

    // Create a new BufferGeometry instance atomically to prevent stale caching/single-frame flashes
    const newGeometry = new THREE.BufferGeometry();

    const uvRect = this.atlas.getUvRect(`destroy_stage_${stage}`);
    if (uvRect === undefined) {
      newGeometry.setIndex(null);
      newGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
      newGeometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(0), 2));
      this.mesh.geometry = newGeometry;
      this.geometry = newGeometry;
      return;
    }

    const { u0, v0, u1, v1 } = uvRect;

    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    let vertexCount = 0;

    // Resolve active targeted block ID and its renderType to support custom geometries
    const blockId = this.blockUpdateWorld.getBlock(blockPos.x, blockPos.y, blockPos.z);
    const blockDef = this.blockRegistry.getById(blockId);
    const renderType = blockDef?.renderType;

    for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
      const face = FACES[faceIndex]!;

      // Check if face is visible (i.e. neighbor block is transparent, non-solid, or air)
      const nx = blockPos.x + face.dx;
      const ny = blockPos.y + face.dy;
      const nz = blockPos.z + face.dz;

      let isFaceVisible = false;
      const isNeighborChunkLoaded = this.blockUpdateWorld.isLoaded(nx, nz);

      // Expose face only to Air blocks, and hide boundary faces when neighbor chunk is unloaded
      if (isNeighborChunkLoaded) {
        const neighborId = this.blockUpdateWorld.getBlock(nx, ny, nz);
        if (neighborId === BlockIds.Air) {
          isFaceVisible = true;
        }
      }

      if (isFaceVisible) {
        // Emit 4 vertices for the face in local coordinates
        for (let i = 0; i < 4; i++) {
          const corner = face.corners[i]!;
          
          let cx = corner[0];
          let cy = corner[1];
          let cz = corner[2];

          // Support custom overlay shapes for non-full cubes (cactus, snow, etc.)
          if (renderType === 'snow') {
            if (cy === 1.0) cy = 0.125;
          } else if (renderType === 'cactus') {
            if (face.nx !== 0) {
              if (cx === 1.0) cx = 0.9375;
              if (cx === 0.0) cx = 0.0625;
            } else if (face.nz !== 0) {
              if (cz === 1.0) cz = 0.9375;
              if (cz === 0.0) cz = 0.0625;
            }
          }

          const px = cx + face.nx * SURFACE_OFFSET;
          const py = cy + face.ny * SURFACE_OFFSET;
          const pz = cz + face.nz * SURFACE_OFFSET;

          positions.push(px, py, pz);

          // Consistent UV orientation: replicate localCornerToTextureUv from ChunkMesher
          const [localU, localV] = localCornerToTextureUv(face, corner);
          const u = u0 + (u1 - u0) * localU;
          const v = v0 + (v1 - v0) * localV;
          uvs.push(u, v);
        }

        // Add indices for two triangles
        indices.push(
          vertexCount + 0, vertexCount + 1, vertexCount + 2,
          vertexCount + 0, vertexCount + 2, vertexCount + 3
        );

        vertexCount += 4;
      }
    }

    newGeometry.setIndex(indices);
    newGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    newGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

    newGeometry.computeVertexNormals();
    newGeometry.computeBoundingBox();
    newGeometry.computeBoundingSphere();

    // Re-assign to mesh and update our reference atomically
    this.mesh.geometry = newGeometry;
    this.geometry = newGeometry;
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }
}
