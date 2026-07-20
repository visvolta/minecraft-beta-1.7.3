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
 * Re-creates exact corner-to-texture-UV mapping from ChunkMesher
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

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(0), 2));

    this.material = new THREE.MeshBasicMaterial({
      map: atlas.texture,
      transparent: true,
      blending: THREE.MultiplyBlending,
      premultipliedAlpha: true,
      depthWrite: false,
      alphaTest: 0.01,
      polygonOffset: true,
      polygonOffsetFactor: -1.0,
      polygonOffsetUnits: -4.0,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'destroyOverlay';
    this.mesh.visible = false;
    this.mesh.renderOrder = 5; // Cleanly render crack overlay above standard block faces
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

    if (this.lastBlockPosKey !== blockPosKey || this.lastStage !== stage) {
      const success = this.rebuildGeometry(blockPos, stage);
      this.lastBlockPosKey = blockPosKey;
      this.lastStage = stage;
      if (!success) {
        this.mesh.visible = false;
        return;
      }
    }

    if (!this.mesh.geometry || !this.mesh.geometry.getAttribute('position') || this.mesh.geometry.getAttribute('position').count === 0) {
      this.mesh.visible = false;
      return;
    }

    this.mesh.position.set(blockPos.x, blockPos.y, blockPos.z);
    this.mesh.visible = true;
  }

  private rebuildGeometry(blockPos: { x: number; y: number; z: number }, stage: number): boolean {
    const blockId = this.blockUpdateWorld.getBlock(blockPos.x, blockPos.y, blockPos.z);
    if (blockId === BlockIds.Air) {
      this.geometry.dispose();
      const emptyGeo = new THREE.BufferGeometry();
      this.mesh.geometry = emptyGeo;
      this.geometry = emptyGeo;
      return false;
    }

    let uvRect = this.atlas.getUvRect(`destroy_stage_${stage}`);
    if (uvRect === undefined) {
      console.error(`[DestroyOverlayRenderer] Unresolved destroy texture: destroy_stage_${stage}. Using missing_texture fallback.`);
      uvRect = this.atlas.getUvRect('missing_texture');
      if (uvRect === undefined) {
        this.geometry.dispose();
        const emptyGeo = new THREE.BufferGeometry();
        this.mesh.geometry = emptyGeo;
        this.geometry = emptyGeo;
        return false;
      }
    }

    const { u0, v0, u1, v1 } = uvRect;

    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    let vertexCount = 0;

    const blockDef = this.blockRegistry.getById(blockId);
    const renderType = blockDef?.renderType;

    for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
      const face = FACES[faceIndex]!;

      const nx = blockPos.x + face.dx;
      const ny = blockPos.y + face.dy;
      const nz = blockPos.z + face.dz;

      let isFaceVisible = false;
      const isNeighborChunkLoaded = this.blockUpdateWorld.isLoaded(nx, nz);

      if (isNeighborChunkLoaded) {
        const neighborId = this.blockUpdateWorld.getBlock(nx, ny, nz);
        if (neighborId === BlockIds.Air) {
          isFaceVisible = true;
        } else {
          const neighborDef = this.blockRegistry.getById(neighborId);
          if (!neighborDef || !neighborDef.solid || neighborDef.transparent || neighborDef.isLiquid) {
            isFaceVisible = true;
          }
        }
      }

      if (isFaceVisible) {
        const meta = this.blockUpdateWorld.getBlockMetadata(blockPos.x, blockPos.y, blockPos.z);
        for (let i = 0; i < 4; i++) {
          const corner = face.corners[i]!;
          
          let cx = corner[0];
          let cy = corner[1];
          let cz = corner[2];

          // Determine bounding box based on custom block types (Beta 1.7.3)
          let minX = 0, maxX = 1, minY = 0, maxY = 1, minZ = 0, maxZ = 1;

          if (blockId === BlockIds.Slab) {
            minY = 0; maxY = 0.5;
          } else if (blockId === BlockIds.WoodDoor || blockId === BlockIds.IronDoor) {
            const isUpper = (meta & 8) !== 0;
            let baseMeta = meta;
            if (isUpper) {
              const lowerId = this.blockUpdateWorld.getBlock(blockPos.x, blockPos.y - 1, blockPos.z);
              if (lowerId === blockId) {
                baseMeta = this.blockUpdateWorld.getBlockMetadata(blockPos.x, blockPos.y - 1, blockPos.z);
              }
            }
            const state = (baseMeta & 4) === 0 ? (baseMeta - 1) & 3 : baseMeta & 3;
            const thickness = 3 / 16;
            if (state === 0) { minZ = 0; maxZ = thickness; }
            else if (state === 1) { minX = 1 - thickness; maxX = 1; }
            else if (state === 2) { minZ = 1 - thickness; maxZ = 1; }
            else if (state === 3) { minX = 0; maxX = thickness; }
          } else if (blockId === BlockIds.Trapdoor) {
            const isOpened = (meta & 4) !== 0;
            const attachMeta = meta & 3;
            const thickness = 3 / 16;
            maxY = thickness;
            if (isOpened) {
              if (attachMeta === 0) { minX = 0; maxX = thickness; minY = 0; maxY = 1; }
              else if (attachMeta === 1) { minX = 1 - thickness; maxX = 1; minY = 0; maxY = 1; }
              else if (attachMeta === 2) { minZ = 0; maxZ = thickness; minY = 0; maxY = 1; }
              else if (attachMeta === 3) { minZ = 1 - thickness; maxZ = 1; minY = 0; maxY = 1; }
            }
          } else if (blockId === BlockIds.Ladder) {
            const t = 2 / 16;
            if (meta === 2) { minZ = 1 - t; maxZ = 1; }
            else if (meta === 3) { minZ = 0; maxZ = t; }
            else if (meta === 4) { minX = 1 - t; maxX = 1; }
            else if (meta === 5) { minX = 0; maxX = t; }
          } else if (blockId === BlockIds.WoodPressurePlate || blockId === BlockIds.StonePressurePlate) {
            const pressed = meta === 1;
            const thickness = pressed ? 1/16 : 2/16;
            const padding = 1/16;
            minX = padding; maxX = 1 - padding;
            maxY = thickness;
            minZ = padding; maxZ = 1 - padding;
          } else if (blockId === BlockIds.StoneButton) {
            const pressed = (meta & 8) !== 0;
            const dir = meta & 7;
            const depth = pressed ? 1/16 : 2/16;
            const w = 6/16, h = 4/16;
            minX = 0.5 - w/2; maxX = 0.5 + w/2;
            minY = 0.5 - h/2; maxY = 0.5 + h/2;
            minZ = 0.5 - w/2; maxZ = 0.5 + w/2;
            if (dir === 1) { minX = 0; maxX = depth; }
            else if (dir === 2) { minX = 1 - depth; maxX = 1; }
            else if (dir === 3) { minZ = 0; maxZ = depth; }
            else if (dir === 4) { minZ = 1 - depth; maxZ = 1; }
          } else if (blockId === BlockIds.Lever) {
            const dir = meta & 7;
            const baseDepth = 3/16;
            minX = 0.5 - 2/16; maxX = 0.5 + 2/16;
            minY = 0.5 - 3/16; maxY = 0.5 + 3/16;
            minZ = 0.5 - 2/16; maxZ = 0.5 + 2/16;
            if (dir === 1) { minX = 0; maxX = baseDepth; }
            else if (dir === 2) { minX = 1 - baseDepth; maxX = 1; }
            else if (dir === 3) { minZ = 0; maxZ = baseDepth; }
            else if (dir === 4) { minZ = 1 - baseDepth; maxZ = 1; }
            else if (dir === 5 || dir === 6) { minY = 0; maxY = baseDepth; }
          } else if (blockId === BlockIds.SignPost) {
            const bw = 12/32, bh = 12/32, bd = 1/32;
            minX = 0.5 - bw; maxX = 0.5 + bw;
            minY = 8/16; maxY = 8/16 + bh;
            minZ = 0.5 - bd; maxZ = 0.5 + bd;
          } else if (blockId === BlockIds.WallSign) {
            const bw = 12/32, bh = 12/32, bd = 2/32;
            minX = 0.5 - bw; maxX = 0.5 + bw;
            minY = 0.5 - bh/2; maxY = 0.5 + bh/2;
            if (meta === 2) { minZ = 1 - bd; maxZ = 1; }
            else if (meta === 3) { minZ = 0; maxZ = bd; }
            else if (meta === 4) { minX = 1 - bd; maxX = 1; }
            else if (meta === 5) { minX = 0; maxX = bd; }
          } else if (renderType === 'snow') {
            minY = 0; maxY = 0.125;
          } else if (renderType === 'cactus') {
            minX = 0.0625; maxX = 0.9375;
            minZ = 0.0625; maxZ = 0.9375;
          }

          cx = minX + (maxX - minX) * cx;
          cy = minY + (maxY - minY) * cy;
          cz = minZ + (maxZ - minZ) * cz;

          const px = cx + face.nx * SURFACE_OFFSET;
          const py = cy + face.ny * SURFACE_OFFSET;
          const pz = cz + face.nz * SURFACE_OFFSET;

          positions.push(px, py, pz);

          const [localU, localV] = localCornerToTextureUv(face, corner);
          const u = u0 + (u1 - u0) * localU;
          const v = v0 + (v1 - v0) * localV;
          uvs.push(u, v);
        }

        indices.push(
          vertexCount + 0, vertexCount + 1, vertexCount + 2,
          vertexCount + 0, vertexCount + 2, vertexCount + 3
        );

        vertexCount += 4;
      }
    }

    if (positions.length === 0) {
      this.geometry.dispose();
      const emptyGeo = new THREE.BufferGeometry();
      this.mesh.geometry = emptyGeo;
      this.geometry = emptyGeo;
      return false;
    }

    this.geometry.dispose();
    const newGeometry = new THREE.BufferGeometry();
    newGeometry.setIndex(indices);
    newGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    newGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

    newGeometry.computeVertexNormals();
    newGeometry.computeBoundingBox();
    newGeometry.computeBoundingSphere();

    this.mesh.geometry = newGeometry;
    this.geometry = newGeometry;
    return true;
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }
}
