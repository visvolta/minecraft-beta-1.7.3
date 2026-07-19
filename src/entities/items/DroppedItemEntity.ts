import * as THREE from 'three';
import { AABB } from '../../physics/AABB';
import type { ChunkManager } from '../../world/ChunkManager';
import { BlockRegistry } from '../../blocks/BlockRegistry';
import type { TextureAtlas } from '../../assets/TextureAtlas';
import type { ItemTextureAtlas } from '../../assets/ItemTextureAtlas';
import { worldToChunkLocal } from '../../world/worldToChunkCoords';
import { BlockIds } from '../../blocks/BlockId';
import type { Drop } from './BlockDropResolver';
import { classifyItemRender, isBlock3dCategory, isFlatItemCategory, isToolCategory } from '../../inventory/ItemRenderClassifier';
import { BlockItemModelBuilder } from '../../inventory/BlockItemModelBuilder';
import { resolveBlockTexture } from '../../blocks/resolveBlockTexture';
import { resolveBlockTint } from '../../blocks/resolveBlockTint';
import { ItemIconResolver } from '../../inventory/ItemIconResolver';

const COLLISION_EPSILON = 0.001;
const ITEM_SIZE = 0.25;

export class DroppedItemEntity {
  public readonly position = { x: 0, y: 0, z: 0 };
  public readonly velocity = { x: 0, y: 0, z: 0 };
  public readonly drop: Drop;

  public age = 0;
  public delayBeforeCanPickup = 10;
  public readonly hoverStart: number;
  public onGround = false;
  public isDead = false;

  public readonly group = new THREE.Group();

  private readonly scene: THREE.Scene;
  private readonly chunkManager: ChunkManager;
  private readonly blockRegistry: BlockRegistry;
  private readonly atlas: TextureAtlas;
  private readonly itemAtlas: ItemTextureAtlas;
  private readonly heldBlockMaterial: THREE.Material;
  private readonly itemHeldMaterial: THREE.Material;
  private readonly icons = new ItemIconResolver();

  public constructor(
    scene: THREE.Scene,
    chunkManager: ChunkManager,
    blockRegistry: BlockRegistry,
    atlas: TextureAtlas,
    itemAtlas: ItemTextureAtlas,
    heldBlockMaterial: THREE.Material,
    itemHeldMaterial: THREE.Material,
    x: number,
    y: number,
    z: number,
    drop: Drop,
    delay = 10,
  ) {
    this.scene = scene;
    this.chunkManager = chunkManager;
    this.blockRegistry = blockRegistry;
    this.atlas = atlas;
    this.itemAtlas = itemAtlas;
    this.heldBlockMaterial = heldBlockMaterial;
    this.itemHeldMaterial = itemHeldMaterial;
    this.drop = drop;

    this.position.x = x;
    this.position.y = y;
    this.position.z = z;

    this.delayBeforeCanPickup = delay;
    this.hoverStart = Math.random() * Math.PI * 2;

    // 1. Initial Launch Velocity (Beta 1.7.3)
    this.velocity.x = Math.random() * 0.2 - 0.1;
    this.velocity.y = 0.2;
    this.velocity.z = Math.random() * 0.2 - 0.1;

    // Build the visual meshes based on initial count
    this.rebuildVisualsForCount(drop.count);

    this.group.position.set(x, y, z);
    this.scene.add(this.group);
  }

  public rebuildVisualsForCount(count: number): void {
    // Clear old visual meshes cleanly
    while (this.group.children.length > 0) {
      const child = this.group.children[0]!;
      this.group.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        // Only dispose material if it is NOT one of the shared/pooled engine materials
        if (child.material instanceof THREE.Material && child.material !== this.heldBlockMaterial && child.material !== this.itemHeldMaterial) {
          child.material.dispose();
        }
      }
    }

    // Determine the category using the authoritative classifier
    const category = classifyItemRender({ id: this.drop.id, type: this.drop.type }, this.blockRegistry);
    const def = this.blockRegistry.getById(this.drop.id as number);

    let copyCount = 1;
    if (count > 20) copyCount = 4;
    else if (count > 5) copyCount = 3;
    else if (count > 1) copyCount = 2;

    for (let i = 0; i < copyCount; i++) {
      let mesh: THREE.Mesh | undefined;

      if (category === 'unsupported' || category === 'empty') {
        const geometry = BlockItemModelBuilder.buildDebugPlaceholder();
        mesh = new THREE.Mesh(geometry, this.heldBlockMaterial);
      } else if (isBlock3dCategory(category) && def !== undefined) {
        const geometry = BlockItemModelBuilder.build3DGeometry(def, this.atlas);
        mesh = new THREE.Mesh(geometry, this.heldBlockMaterial);
        mesh.scale.set(0.25, 0.25, 0.25);
      } else if ((isFlatItemCategory(category) || isToolCategory(category)) && this.drop.type === 'block' && def !== undefined) {
        const texName = resolveBlockTexture(def, 'side') || resolveBlockTexture(def, 'top') || 'stone';
        let uvRect = this.atlas.getUvRect(texName);
        const tint = resolveBlockTint(def, 'side');
        let useItemAtlas = false;

        if (uvRect === undefined) {
          const itemPath = this.icons.resolve(String(this.drop.id));
          const nameMatch = itemPath.match(/\/textures\/items\/([^/]+)\.png$/);
          if (nameMatch && nameMatch[1]) {
            uvRect = this.itemAtlas.getUvRect(nameMatch[1]);
            useItemAtlas = uvRect !== undefined;
          }
        }

        if (uvRect === undefined) {
          console.warn(`[DroppedItemEntity] Missing block texture: "${texName}". Using debug placeholder.`);
          const geometry = BlockItemModelBuilder.buildDebugPlaceholder();
          mesh = new THREE.Mesh(geometry, this.heldBlockMaterial);
        } else {
          const u0 = uvRect.u0, v0 = uvRect.v0, u1 = uvRect.u1, v1 = uvRect.v1;
          const geometry = this.createOpposedQuadsGeometry(u0, v0, u1, v1, tint[0], tint[1], tint[2], false);
          mesh = new THREE.Mesh(geometry, useItemAtlas ? this.itemHeldMaterial : this.heldBlockMaterial);
        }
      } else if (isFlatItemCategory(category) || isToolCategory(category)) {
        // Flat item or tool drop: quads mapped to ItemTextureAtlas or BlockAtlas fallback
        let itemKey = String(this.drop.id);
        let uvRect = this.itemAtlas.getUvRect(itemKey);
        let useBlockAtlas = false;

        if (uvRect === undefined) {
          const resolvedPath = this.icons.resolve(itemKey);
          const itemMatch = resolvedPath.match(/\/textures\/items\/([^/]+)\.png$/);
          const blockMatch = resolvedPath.match(/\/textures\/blocks\/([^/]+)\.png$/);
          if (itemMatch && itemMatch[1]) {
            uvRect = this.itemAtlas.getUvRect(itemMatch[1]);
          } else if (blockMatch && blockMatch[1]) {
            uvRect = this.atlas.getUvRect(blockMatch[1]);
            useBlockAtlas = uvRect !== undefined;
          }
        }

        if (uvRect === undefined) {
          console.warn(`[DroppedItemEntity] Missing item texture: "${this.drop.id}". Using debug placeholder.`);
          const geometry = BlockItemModelBuilder.buildDebugPlaceholder();
          mesh = new THREE.Mesh(geometry, this.itemHeldMaterial);
        } else {
          const u0 = uvRect.u0, v0 = uvRect.v0, u1 = uvRect.u1, v1 = uvRect.v1;
          const geometry = this.createOpposedQuadsGeometry(u0, v0, u1, v1, 1.0, 1.0, 1.0, false);
          mesh = new THREE.Mesh(geometry, useBlockAtlas ? this.heldBlockMaterial : this.itemHeldMaterial);
        }
      } else {
        const geometry = BlockItemModelBuilder.buildDebugPlaceholder();
        mesh = new THREE.Mesh(geometry, this.heldBlockMaterial);
      }

      if (mesh) {
        if (i > 0) {
          mesh.position.set(
            (Math.random() * 2 - 1) * 0.15,
            (Math.random() * 2 - 1) * 0.15,
            (Math.random() * 2 - 1) * 0.15
          );
        }
        this.group.add(mesh);
      }
    }
  }

  public getAABB(): AABB {
    const half = ITEM_SIZE / 2;
    return new AABB(
      this.position.x - half,
      this.position.y,
      this.position.z - half,
      this.position.x + half,
      this.position.y + ITEM_SIZE,
      this.position.z + half
    );
  }

  /**
   * Run once per 20Hz authoritative game tick.
   * Performs exact gravity, world-collision, friction, and age updates.
   */
  public tick(): void {
    if (this.isDead) return;

    // Decrement delay cooldown
    if (this.delayBeforeCanPickup > 0) {
      this.delayBeforeCanPickup--;
    }

    // Gravity per tick: motionY -= 0.04
    this.velocity.y -= 0.04;

    // Maximum terminal velocity fall check
    if (this.velocity.y < -1.0) {
      this.velocity.y = -1.0;
    }

    // Resolve vertical/horizontal collision resolution
    this.moveAndCollide();

    // Ground slipperiness / drag multiplication per tick
    let friction = 0.98;
    if (this.onGround) {
      // Default ground friction slipperiness is 0.6. Ice block is 0.98.
      let slipperiness = 0.6;
      const bx = Math.floor(this.position.x);
      const by = Math.floor(this.position.y - 0.1);
      const bz = Math.floor(this.position.z);
      const blockId = this.getBlockIdAt(bx, by, bz);
      if (blockId === BlockIds.Ice) {
        slipperiness = 0.98;
      }
      friction = slipperiness * 0.98; // = 0.588 on standard blocks
    }

    this.velocity.x *= friction;
    this.velocity.z *= friction;
    this.velocity.y *= 0.98; // vertical air drag

    // Ground bounce
    if (this.onGround) {
      this.velocity.y *= -0.5;
    }

    // Update simulation lifetime age
    this.age++;
    if (this.age >= 6000) { // 5 minutes despawn time
      this.isDead = true;
      this.cleanup();
    }
  }

  /**
   * Continuous rotation and bobbing calculations for smooth rendering between simulation updates.
   */
  public updateVisuals(): void {
    if (this.isDead) return;

    // 1. Smooth rotation: Y-rotation angle in radians is (age / 20.0) + hoverStart
    const rotationAngle = (this.age / 20.0) + this.hoverStart;
    this.group.rotation.y = rotationAngle;

    // 2. Smooth bobbing: Y hover offset is sin(age / 10.0 + hoverStart) * 0.1 + 0.1
    const bobOffset = Math.sin(this.age / 10.0 + this.hoverStart) * 0.1 + 0.1;
    this.group.position.set(
      this.position.x,
      this.position.y + bobOffset,
      this.position.z
    );
  }

  private moveAndCollide(): void {
    const delta = {
      x: this.velocity.x,
      y: this.velocity.y,
      z: this.velocity.z,
    };

    let grounded = false;

    // Resolve collision order: Y, then X, then Z
    const order: ('x' | 'y' | 'z')[] = ['y', 'x', 'z'];
    for (const axis of order) {
      const box = this.getAABB();
      const resolved = this.resolveAxis(box, axis, delta[axis]);

      if (axis === 'x') {
        this.position.x += resolved;
        if (resolved !== delta.x) {
          this.velocity.x = 0;
        }
      } else if (axis === 'z') {
        this.position.z += resolved;
        if (resolved !== delta.z) {
          this.velocity.z = 0;
        }
      } else {
        this.position.y += resolved;
        if (resolved !== delta.y) {
          if (delta.y < 0) {
            grounded = true;
          }
          this.velocity.y = 0;
        }
      }
    }

    this.onGround = grounded;
  }

  private resolveAxis(box: AABB, axis: 'x' | 'y' | 'z', distance: number): number {
    if (distance === 0) return 0;

    const movingPositive = distance > 0;
    const sweptBox = this.sweptBoxAlongAxis(box, axis, distance);
    const blockRange = this.blockRangeCoveringBox(sweptBox);

    let allowedDistance = distance;

    for (let bx = blockRange.minX; bx <= blockRange.maxX; bx++) {
      for (let by = blockRange.minY; by <= blockRange.maxY; by++) {
        for (let bz = blockRange.minZ; bz <= blockRange.maxZ; bz++) {
          if (!this.isSolidBlock(bx, by, bz)) {
            continue;
          }

          const blockBox = new AABB(bx, by, bz, bx + 1, by + 1, bz + 1);

          if (!this.overlapsOnOtherAxes(box, blockBox, axis)) {
            continue;
          }

          const limited = this.limitDistance(box, blockBox, axis, movingPositive);
          if (movingPositive) {
            allowedDistance = Math.min(allowedDistance, Math.max(0, limited));
          } else {
            allowedDistance = Math.max(allowedDistance, Math.min(0, limited));
          }
        }
      }
    }

    return allowedDistance;
  }

  private isSolidBlock(worldX: number, worldY: number, worldZ: number): boolean {
    if (worldY < 0 || worldY >= 128) return false;
    const { chunkX, chunkZ, localX, localZ } = worldToChunkLocal(worldX, worldZ);
    const chunk = this.chunkManager.getChunk(chunkX, chunkZ);
    if (chunk === undefined) return false; // Unloaded chunks are treat as non-solid

    const blockId = chunk.getBlock(localX, worldY, localZ);
    const definition = this.blockRegistry.getById(blockId);
    return definition !== undefined && definition.solid;
  }

  private getBlockIdAt(worldX: number, worldY: number, worldZ: number): number {
    if (worldY < 0 || worldY >= 128) return 0;
    const { chunkX, chunkZ, localX, localZ } = worldToChunkLocal(worldX, worldZ);
    const chunk = this.chunkManager.getChunk(chunkX, chunkZ);
    return chunk?.getBlock(localX, worldY, localZ) ?? 0;
  }

  private overlapsOnOtherAxes(box: AABB, blockBox: AABB, axis: 'x' | 'y' | 'z'): boolean {
    const xOverlap = axis === 'x' || (box.minX < blockBox.maxX && box.maxX > blockBox.minX);
    const yOverlap = axis === 'y' || (box.minY < blockBox.maxY && box.maxY > blockBox.minY);
    const zOverlap = axis === 'z' || (box.minZ < blockBox.maxZ && box.maxZ > blockBox.minZ);
    return xOverlap && yOverlap && zOverlap;
  }

  private limitDistance(box: AABB, blockBox: AABB, axis: 'x' | 'y' | 'z', movingPositive: boolean): number {
    if (axis === 'x') {
      return movingPositive ? blockBox.minX - box.maxX - COLLISION_EPSILON : blockBox.maxX - box.minX + COLLISION_EPSILON;
    }
    if (axis === 'y') {
      return movingPositive ? blockBox.minY - box.maxY - COLLISION_EPSILON : blockBox.maxY - box.minY + COLLISION_EPSILON;
    }
    return movingPositive ? blockBox.minZ - box.maxZ - COLLISION_EPSILON : blockBox.maxZ - box.minZ + COLLISION_EPSILON;
  }

  private sweptBoxAlongAxis(box: AABB, axis: 'x' | 'y' | 'z', distance: number): AABB {
    const dx = axis === 'x' ? distance : 0;
    const dy = axis === 'y' ? distance : 0;
    const dz = axis === 'z' ? distance : 0;
    const moved = box.translated(dx, dy, dz);
    return new AABB(
      Math.min(box.minX, moved.minX),
      Math.min(box.minY, moved.minY),
      Math.min(box.minZ, moved.minZ),
      Math.max(box.maxX, moved.maxX),
      Math.max(box.maxY, moved.maxY),
      Math.max(box.maxZ, moved.maxZ)
    );
  }

  private blockRangeCoveringBox(box: AABB) {
    return {
      minX: Math.floor(box.minX),
      maxX: Math.ceil(box.maxX) - 1,
      minY: Math.floor(box.minY),
      maxY: Math.ceil(box.maxY) - 1,
      minZ: Math.floor(box.minZ),
      maxZ: Math.ceil(box.maxZ) - 1,
    };
  }

  private createOpposedQuadsGeometry(
    u0: number, v0: number, u1: number, v1: number,
    r = 1.0, g = 1.0, b = 1.0, isMissing = false
  ): THREE.BufferGeometry {
    const geom = new THREE.BufferGeometry();
    const half = 0.2; // Miniature size
    
    // 8 vertices: 4 for front quad, 4 for back quad
    const positions = new Float32Array([
      // Front quad
      -half,  half,  0.001,
       half,  half,  0.001,
      -half, -half,  0.001,
       half, -half,  0.001,

      // Back quad (offset slightly backward)
      -half,  half, -0.001,
       half,  half, -0.001,
      -half, -half, -0.001,
       half, -half, -0.001,
    ]);

    const uvs = new Float32Array([
      // Front face standard UVs
      u0, v0,
      u1, v0,
      u0, v1,
      u1, v1,

      // Back face horizontally-flipped UVs so they render unmirrored from behind
      u1, v0,
      u0, v0,
      u1, v1,
      u0, v1,
    ]);

    const colors = new Float32Array(24);
    const finalR = isMissing ? 1.0 : r;
    const finalG = isMissing ? 0.0 : g;
    const finalB = isMissing ? 1.0 : b;
    for (let i = 0; i < 8; i++) {
      colors[i * 3 + 0] = finalR;
      colors[i * 3 + 1] = finalG;
      colors[i * 3 + 2] = finalB;
    }

    const indices = [
      // Front face (Counter-clockwise winding)
      0, 2, 1,
      1, 2, 3,

      // Back face (Clockwise winding from front, but counter-clockwise from back)
      5, 6, 4,
      7, 6, 5
    ];

    geom.setIndex(indices);
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geom.computeVertexNormals();
    return geom;
  }

  public cleanup(): void {
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material && child.material !== this.heldBlockMaterial && child.material !== this.itemHeldMaterial) {
          child.material.dispose();
        }
      }
    });
    this.group.removeFromParent();
  }
}
