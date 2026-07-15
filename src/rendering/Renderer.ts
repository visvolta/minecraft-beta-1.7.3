import * as THREE from 'three';

const BACKGROUND_COLOR = 0x70a0ff;
const CAMERA_FOV = 70;
const CAMERA_NEAR = 0.05;
const CAMERA_FAR = 512;
const PIXEL_RATIO = 1;

/**
 * Owns the Three.js scene, camera, and WebGL renderer.
 * Rendering and resize only — the Engine owns the game loop.
 */
export class Renderer {
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.PerspectiveCamera;
  public readonly renderer: THREE.WebGLRenderer;

  private readonly onResizeBound = (): void => {
    this.handleResize();
  };

  public constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(BACKGROUND_COLOR);

    this.camera = new THREE.PerspectiveCamera(
      CAMERA_FOV,
      window.innerWidth / window.innerHeight,
      CAMERA_NEAR,
      CAMERA_FAR,
    );

    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.renderer.setPixelRatio(PIXEL_RATIO);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Add restrained Three.js scene lighting for directional depth
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 0.6);
    sunLight.position.set(1, 1.5, 0.5).normalize();
    this.scene.add(sunLight);
  }

  /** Canvas element to mount in the DOM. */
  public get domElement(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  /** Begin listening for window resize. Called by the Engine on start. */
  public start(): void {
    window.addEventListener('resize', this.onResizeBound);
    this.handleResize();
  }

  /** Stop listening for window resize. Called by the Engine on stop. */
  public stop(): void {
    window.removeEventListener('resize', this.onResizeBound);
  }

  public render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private handleResize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }
}
