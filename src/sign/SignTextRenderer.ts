import * as THREE from 'three';
import type { SignManager, SignContainer } from './SignManager';
import type { BlockUpdateWorld } from '../world/BlockUpdateWorld';
import { BlockIds } from '../blocks/BlockId';

export class SignTextRenderer {
  private readonly group = new THREE.Group();
  private readonly meshes = new Map<string, THREE.Mesh>();
  private readonly geometries = new Map<string, THREE.BufferGeometry>();
  private readonly materials = new Map<string, THREE.MeshBasicMaterial>();

  // Use a tiny offset to prevent z-fighting with the front face of the sign geometry.
  // The ChunkMesher will build the sign post or wall sign. This just places the text on it.
  private static readonly EPSILON = 0.001;

  public constructor(
    private readonly scene: THREE.Scene,
    private readonly signManager: SignManager,
    private readonly blockUpdateWorld: BlockUpdateWorld
  ) {
    this.scene.add(this.group);
  }

  public update(): void {
    const activeKeys = new Set<string>();
    const containers = this.signManager.getContainers();

    for (const c of containers) {
      const key = c.getPosKey();
      activeKeys.add(key);

      const blockId = this.blockUpdateWorld.getBlock(c.x, c.y, c.z);
      if (blockId !== BlockIds.SignPost && blockId !== BlockIds.WallSign) {
        continue; // Unloaded chunk or mismatched state.
      }

      if (c.needsTextureUpdate || !this.meshes.has(key)) {
        c.needsTextureUpdate = false;
        this.rebuildSignMesh(c, blockId);
      }
    }

    // Cleanup removed or unloaded signs
    for (const key of this.meshes.keys()) {
      if (!activeKeys.has(key)) {
        this.removeMesh(key);
      }
    }
  }

  private rebuildSignMesh(c: SignContainer, blockId: number): void {
    this.removeMesh(c.getPosKey());

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128; // Text area resolution (2:1 aspect ratio matches wooden board exactly)
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, 256, 128);

    ctx.fillStyle = '#000000';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (let i = 0; i < 4; i++) {
      ctx.fillText(c.lines[i] || '', 128, 22 + i * 22);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.1,
      side: THREE.FrontSide,
      depthWrite: false, // Text is an overlay
    });
    // In a real implementation we would attachHeightAwareFog to apply light levels
    // But since this is a pure text overlay, let's just make it simple.
    // Or we can manually sample light level here and darken the material color.
    // For now we will rely on it being mostly readable black text.

    // A sign face is 24/32 wide and 12/32 tall in actual block coordinates (from center).
    // Sign is 1 unit wide conceptually, but the wooden board is smaller.
    // Let's create a plane geometry matching the wooden board front face.
    const boardWidth = 24 / 32;
    const boardHeight = 12 / 32;
    const geometry = new THREE.PlaneGeometry(boardWidth, boardHeight);
    const mesh = new THREE.Mesh(geometry, material);

    const metadata = this.blockUpdateWorld.getBlockMetadata(c.x, c.y, c.z);

    // Apply specific Beta 1.7.3 orientations
    if (blockId === BlockIds.WallSign) {
      // metadata: 2=North, 3=South, 4=West, 5=East
      // We push it slightly forward from the center of the block depending on the side it's attached to.
      // Wall signs are placed directly against the solid block.
      // The front face is 1/16th (2/32) thick. So the text goes at 1/16th offset.
      if (metadata === 2) {
        mesh.position.set(c.x + 0.5, c.y + 0.5, c.z + 1 - (2 / 32) - SignTextRenderer.EPSILON);
        mesh.rotation.y = Math.PI;
      } else if (metadata === 3) {
        mesh.position.set(c.x + 0.5, c.y + 0.5, c.z + (2 / 32) + SignTextRenderer.EPSILON);
        mesh.rotation.y = 0;
      } else if (metadata === 4) {
        mesh.position.set(c.x + 1 - (2 / 32) - SignTextRenderer.EPSILON, c.y + 0.5, c.z + 0.5);
        mesh.rotation.y = -Math.PI / 2;
      } else if (metadata === 5) {
        mesh.position.set(c.x + (2 / 32) + SignTextRenderer.EPSILON, c.y + 0.5, c.z + 0.5);
        mesh.rotation.y = Math.PI / 2;
      }
    } else {
      // Standing sign (metadata is 0-15 rotation)
      // The text is on one side, rotation steps are 22.5 degrees.
      const rotation = (metadata * 360) / 16;
      const angle = (rotation * Math.PI) / 180;
      
      mesh.position.set(c.x + 0.5, c.y + 9 / 16, c.z + 0.5); // Center of the board vertically
      mesh.rotation.y = -angle; // Rotate text properly
      
      // Board is 1/16th thick, we offset by half that thickness forward
      mesh.translateZ(1 / 32 + SignTextRenderer.EPSILON);
    }

    this.group.add(mesh);
    this.meshes.set(c.getPosKey(), mesh);
    this.materials.set(c.getPosKey(), material);
    this.geometries.set(c.getPosKey(), geometry);
  }

  private removeMesh(key: string): void {
    const mesh = this.meshes.get(key);
    if (mesh) {
      this.group.remove(mesh);
      this.meshes.delete(key);
    }
    const geom = this.geometries.get(key);
    if (geom) {
      geom.dispose();
      this.geometries.delete(key);
    }
    const mat = this.materials.get(key);
    if (mat) {
      if (mat.map) mat.map.dispose();
      mat.dispose();
      this.materials.delete(key);
    }
  }
}
