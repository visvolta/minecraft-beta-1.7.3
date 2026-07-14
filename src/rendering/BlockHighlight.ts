import * as THREE from 'three';
import type { BlockPosition } from '../world/Raycaster';

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
  public setTarget(blockPos: BlockPosition | undefined): void {
    if (blockPos === undefined) {
      this.lineSegments.visible = false;
      return;
    }

    this.lineSegments.position.set(
      blockPos.x + 0.5,
      blockPos.y + 0.5,
      blockPos.z + 0.5,
    );
    this.lineSegments.visible = true;
  }

  public dispose(): void {
    this.lineSegments.geometry.dispose();
    (this.lineSegments.material as THREE.Material).dispose();
    this.lineSegments.removeFromParent();
  }
}
