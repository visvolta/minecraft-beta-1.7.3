/**
 * Lightweight Three.js panorama renderer for main menu background.
 * Uses explicit face definitions with rotations.
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
    this.renderer.domElement.style.cssText = `
      position: absolute;
      top: 0; left: 0; width: 100%; height: 100%;
      z-index: 0;
      pointer-events: none;
      display: block;
    `;
    container.style.position = 'relative';
    container.style.overflow = 'hidden';
    container.appendChild(this.renderer.domElement);
  }

  public async loadPanorama(def: PanoramaDefinition): Promise<void> {
    const loader = new THREE.TextureLoader();
    const texturePromises = [
      loader.loadAsync(`/textures/gui/panoramas/${def.id}/${def.faces.right.texture}`),
      loader.loadAsync(`/textures/gui/panoramas/${def.id}/${def.faces.left.texture}`),
      loader.loadAsync(`/textures/gui/panoramas/${def.id}/${def.faces.top.texture}`),
      loader.loadAsync(`/textures/gui/panoramas/${def.id}/${def.faces.bottom.texture}`),
      loader.loadAsync(`/textures/gui/panoramas/${def.id}/${def.faces.front.texture}`),
      loader.loadAsync(`/textures/gui/panoramas/${def.id}/${def.faces.back.texture}`),
    ];
    const textures = await Promise.all(texturePromises);

    const materials = textures.map((tex, idx) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      const rotation = this.faceRotation(def, idx);
      const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide });
      // Apply rotation by rotating the texture using texture.repeat/offset is complex;
      // Instead, we rotate the cube face geometry or apply via UV rotation.
      // For simplicity with BackSide cube, we apply rotation through texture transform.
      tex.center.set(0.5, 0.5);
      tex.rotation = THREE.MathUtils.degToRad(rotation);
      tex.needsUpdate = true;
      return mat;
    });

    const geometry = new THREE.BoxGeometry(50, 50, 50);
    this.cubeMesh = new THREE.Mesh(geometry, materials);
    this.scene.add(this.cubeMesh);
    this.texturesLoaded = true;
  }

  private faceRotation(def: PanoramaDefinition, index: number): number {
    // Three.js BoxGeometry material index order: [right(+X), left(-X), top(+Y), bottom(-Y), front(+Z), back(-Z)]
    const faceKeys = ['right', 'left', 'top', 'bottom', 'front', 'back'] as const;
    const key = faceKeys[index];
    if (!key) return 0;
    return def.faces[key]?.rotation ?? 0;
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

  private lastTime = 0;

  private animate = (time?: number): void => {
    if (!this.active) return;
    const now = time ?? performance.now();
    const delta = this.lastTime ? Math.min((now - this.lastTime) / 1000, 0.05) : 0.016;
    this.lastTime = now;
    const speed = 0.05; // very slow rotation
    this.rotationAngle += speed * delta;
    this.animationId = requestAnimationFrame(this.animate);
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
