/**
 * Lightweight Three.js panorama renderer for main menu background.
 * Uses a cubemap approach with 6 textured planes (or cube geometry).
 * Pauses/reduces work when hidden.
 */

import * as THREE from 'three';
import type { PanoramaDefinition } from './PanoramaRegistry';

export class PanoramaRenderer {
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private active = false;
  private animationId = 0;
  private texturesLoaded = false;
  private cubeMesh?: THREE.Mesh;
  private rotationAngle = 0;

  public constructor(container: HTMLElement) {
    this.camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 100);
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(0, 0, -1);

    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);
  }

  public async loadPanorama(def: PanoramaDefinition): Promise<void> {
    const imagePaths = def.images.map((file) => `/textures/gui/panoramas/${def.id}/${file}`);
    const loader = new THREE.TextureLoader();
    const texturePromises = imagePaths.map((path) => loader.loadAsync(path));
    const textures = await Promise.all(texturePromises);

    // Create a cube with textures on each face (standard cubemap mapping)
    // Mapping: 0=left (+X), 1=right (-X), 2=back (+Z), 3=front (-Z), 4=top (+Y), 5=bottom (-Y)
    // Note: actual image roles verified: 4=sky, 5=ground, 0-3=landscape sides
    const materials = textures.map((tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide });
      return mat;
    });

    const geometry = new THREE.BoxGeometry(50, 50, 50);
    // We render inside the cube so the camera at (0,0,0) sees the interior surfaces
    // Using BackSide ensures textures appear correctly oriented from inside
    this.cubeMesh = new THREE.Mesh(geometry, materials);
    this.scene.add(this.cubeMesh);
    this.texturesLoaded = true;
  }

  public start(): void {
    if (!this.texturesLoaded) return;
    this.active = true;
    this.animate();
  }

  public stop(): void {
    this.active = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = 0;
    }
  }

  public resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  public isActive(): boolean {
    return this.active;
  }

  private animate = (): void => {
    if (!this.active) return;
    this.animationId = requestAnimationFrame(this.animate);
    this.rotationAngle += 0.002; // Slow rotation
    if (this.cubeMesh) {
      this.cubeMesh.rotation.y = this.rotationAngle;
    }
    this.renderer.render(this.scene, this.camera);
  };

  public dispose(): void {
    this.stop();
    this.renderer.dispose();
    if (this.cubeMesh) {
      this.scene.remove(this.cubeMesh);
      this.cubeMesh.geometry.dispose();
      (this.cubeMesh.material as THREE.Material[]).forEach((mat) => mat.dispose());
    }
  }
}
