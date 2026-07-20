import * as THREE from 'three';
import type { RaycastHit } from '../world/Raycaster';

/** Tiny outward offset so the highlight doesn't z-fight with block faces. */
const SURFACE_INSET = 0.002;

/**
 * A single reusable wireframe box outlining the currently targeted block.
 * Purely visual: does not modify chunk meshes or own any block/game state.
 */
export class BlockHighlight {
  private readonly lineSegments: THREE.LineSegments;

  public constructor(scene: THREE.Scene) {
    const boxGeometry = new THREE.BoxGeometry(
      1 + SURFACE_INSET * 2,
      1 + SURFACE_INSET * 2,
      1 + SURFACE_INSET * 2,
    );
    const edgesGeometry = new THREE.EdgesGeometry(boxGeometry);
    boxGeometry.dispose();

    const material = new THREE.LineBasicMaterial({ color: 0x000000 });

    this.lineSegments = new THREE.LineSegments(edgesGeometry, material);
    this.lineSegments.name = 'blockHighlight';
    this.lineSegments.visible = false;
    scene.add(this.lineSegments);
  }

  /** Shows the outline centred on the given block, or hides it if undefined. */
  public setTarget(hit: RaycastHit | undefined): void {
    if (hit === undefined || !hit.hitAabb) {
      this.lineSegments.visible = false;
      return;
    }

    const w = hit.hitAabb.maxX - hit.hitAabb.minX;
    const h = hit.hitAabb.maxY - hit.hitAabb.minY;
    const d = hit.hitAabb.maxZ - hit.hitAabb.minZ;

    this.lineSegments.scale.set(w, h, d);

    this.lineSegments.position.set(
      hit.hitAabb.minX + w / 2,
      hit.hitAabb.minY + h / 2,
      hit.hitAabb.minZ + d / 2,
    );
    
    this.lineSegments.visible = true;
  }

  public dispose(): void {
    this.lineSegments.geometry.dispose();
    (this.lineSegments.material as THREE.Material).dispose();
    this.lineSegments.removeFromParent();
  }
}
