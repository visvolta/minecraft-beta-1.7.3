/**
 * Main-menu panorama renderer.
 *
 * Draws the six panorama faces on the inside of a cube with the camera at its
 * centre, matching Beta's `GuiMainMenu` panorama. Rotation is time-based so
 * the speed is identical regardless of frame rate, and blur is a CSS filter on
 * the canvas alone so menu widgets stay sharp.
 */

import * as THREE from 'three';
import type { PanoramaDefinition } from './PanoramaRegistry';
import { panoramaBlurCss, type PanoramaBlur } from './PanoramaBlur';
import { PANORAMA_FACES } from './PanoramaRegistry';

/** Cube edge length. Any value works; the camera sits at the centre. */
const CUBE_SIZE = 50;

export class PanoramaRenderer {
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly container: HTMLElement;
  private active = false;
  private animationId = 0;
  private texturesLoaded = false;
  private cubeMesh: THREE.Mesh | undefined;
  private ownedTextures: THREE.Texture[] = [];
  private rotationAngle = 0;
  /** Degrees per second; taken from the active definition. */
  private rotationSpeed = 0;
  private lastFrameMs = 0;

  public constructor(container: HTMLElement) {
    this.container = container;
    const { width, height } = this.measure();

    this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 100);
    this.camera.position.set(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);

    const canvas = this.renderer.domElement;
    // Behind every menu control. The widgets sit in the same stacking context
    // and are positioned, so a negative z-index keeps them above the canvas
    // without needing per-button z-index bumps.
    canvas.style.position = 'absolute';
    canvas.style.left = '0';
    canvas.style.top = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.zIndex = '0';
    // The canvas must never intercept clicks meant for the buttons above it.
    canvas.style.pointerEvents = 'none';
    container.appendChild(canvas);
  }

  /**
   * Current CSS size of the container, floored to whole pixels and clamped to
   * at least 1. Fractional or zero sizes are what produce WebGL's "drawing to
   * a destination rect smaller than the viewport rect" warning, because the
   * drawing buffer and the CSS box end up disagreeing after rounding.
   */
  private measure(): { width: number; height: number } {
    const rect = this.container.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width || this.container.clientWidth || 1));
    const height = Math.max(1, Math.floor(rect.height || this.container.clientHeight || 1));
    return { width, height };
  }

  public async loadPanorama(def: PanoramaDefinition): Promise<void> {
    const loader = new THREE.TextureLoader();
    const textures = await Promise.all(
      def.images.map((file) => loader.loadAsync(`/textures/gui/panoramas/${def.id}/${file}`)),
    );

    this.rotationSpeed = def.rotationSpeed ?? 0;

    // three.js BoxGeometry material slots are ordered +X, -X, +Y, -Y, +Z, -Z.
    // PANORAMA_FACES states, per slot, which source image belongs there and how
    // it must be oriented, so the definition can stay in Beta's file order.
    const materials = PANORAMA_FACES.map((face) => {
      const texture = textures[face.imageIndex];
      if (texture === undefined) {
        return new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide });
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;

      // Per-face transform, applied about the texture's centre so a rotation
      // spins in place instead of translating the image off the face.
      texture.center.set(0.5, 0.5);
      texture.rotation = (face.rotationDegrees * Math.PI) / 180;
      texture.repeat.set(face.flipX ? -1 : 1, face.flipY ? -1 : 1);
      texture.needsUpdate = true;

      this.ownedTextures.push(texture);
      return new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide });
    });

    const geometry = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
    this.cubeMesh = new THREE.Mesh(geometry, materials);
    this.scene.add(this.cubeMesh);
    this.texturesLoaded = true;
  }

  /** Applies a blur level to the canvas only; menu widgets are unaffected. */
  public setBlur(blur: PanoramaBlur): void {
    this.renderer.domElement.style.filter = panoramaBlurCss(blur);
  }

  public start(): void {
    if (!this.texturesLoaded || this.active) return;
    this.active = true;
    this.lastFrameMs = performance.now();
    this.animate();
  }

  public stop(): void {
    this.active = false;
    if (this.animationId !== 0) {
      cancelAnimationFrame(this.animationId);
      this.animationId = 0;
    }
  }

  /**
   * Resizes the drawing buffer and camera together. Callers may pass a size,
   * but the container is measured either way so the CSS box, the drawing
   * buffer and the camera aspect can never drift apart.
   */
  public resize(_width?: number, _height?: number): void {
    const { width, height } = this.measure();
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // `false` leaves the CSS size to the 100%/100% rules above, so the buffer
    // follows the element rather than fighting it.
    this.renderer.setSize(width, height, false);
  }

  public isActive(): boolean {
    return this.active;
  }

  private animate = (): void => {
    if (!this.active) return;
    this.animationId = requestAnimationFrame(this.animate);

    // Time-based so the pan speed is frame-rate independent. Long gaps (tab
    // restored from background) are clamped to avoid a visible jump.
    const now = performance.now();
    const deltaSeconds = Math.min((now - this.lastFrameMs) / 1000, 0.1);
    this.lastFrameMs = now;

    this.rotationAngle += this.rotationSpeed * deltaSeconds;
    if (this.cubeMesh !== undefined) {
      this.cubeMesh.rotation.y = (this.rotationAngle * Math.PI) / 180;
    }
    this.renderer.render(this.scene, this.camera);
  };

  public dispose(): void {
    this.stop();
    if (this.cubeMesh !== undefined) {
      this.scene.remove(this.cubeMesh);
      this.cubeMesh.geometry.dispose();
      for (const material of this.cubeMesh.material as THREE.Material[]) material.dispose();
      this.cubeMesh = undefined;
    }
    for (const texture of this.ownedTextures) texture.dispose();
    this.ownedTextures = [];
    this.renderer.domElement.remove();
    this.renderer.dispose();
  }
}
