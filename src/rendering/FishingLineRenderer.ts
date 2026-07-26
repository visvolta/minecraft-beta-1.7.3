import * as THREE from 'three';
import { RENDER_ORDER } from './RenderOrder';

/**
 * The line between the rod and the bobber.
 *
 * Beta draws this in `RenderFish` as a series of short segments from the
 * angler's hand to the hook, re-computed every frame. A thin two-point line
 * reproduces it here: the geometry is rebuilt in place each frame rather than
 * reallocated, and the whole object is hidden the moment the bobber goes away
 * so no line can outlive its hook.
 */
export class FishingLineRenderer {
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.LineBasicMaterial;
  private readonly line: THREE.Line;
  private readonly positions: Float32Array;
  private attached = false;

  public constructor(private readonly scene: THREE.Scene) {
    this.positions = new Float32Array(6);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.material = new THREE.LineBasicMaterial({
      // Beta's line is a plain dark strand, unaffected by fog or lighting.
      color: 0x000000,
      transparent: true,
      opacity: 0.85,
      depthTest: true,
      fog: false,
    });
    this.line = new THREE.Line(this.geometry, this.material);
    this.line.frustumCulled = false;
    this.line.renderOrder = RENDER_ORDER.entity;
    this.line.visible = false;
  }

  /**
   * Draws the line between two world-space points. Call every frame while a
   * bobber exists.
   */
  public update(
    from: { x: number; y: number; z: number },
    to: { x: number; y: number; z: number },
  ): void {
    if (!this.attached) {
      this.scene.add(this.line);
      this.attached = true;
    }
    this.positions[0] = from.x;
    this.positions[1] = from.y;
    this.positions[2] = from.z;
    this.positions[3] = to.x;
    this.positions[4] = to.y;
    this.positions[5] = to.z;
    const attribute = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    attribute.needsUpdate = true;
    this.geometry.computeBoundingSphere();
    this.line.visible = true;
  }

  /** Hides the line. Called the instant the bobber is removed. */
  public clear(): void {
    this.line.visible = false;
  }

  public isVisible(): boolean {
    return this.line.visible;
  }

  public dispose(): void {
    this.clear();
    this.line.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
    this.attached = false;
  }
}
