import * as THREE from 'three';
import type { FogState } from './FogController';
import { OVERWORLD_FOG_COLOR } from './FogController';

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

  private readonly backgroundColor = new THREE.Color(OVERWORLD_FOG_COLOR);
  private readonly fog = new THREE.Fog(OVERWORLD_FOG_COLOR, 1, 2);
  private currentFogState: FogState = {
    mode: 'overworld',
    enabled: true,
    colorHex: OVERWORLD_FOG_COLOR,
    near: 1,
    far: 2,
  };

  private readonly onResizeBound = (): void => {
    this.handleResize();
  };

  public constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = this.backgroundColor;
    this.scene.fog = this.fog;

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
    this.renderer.toneMapping = THREE.NoToneMapping;
  }

  /** Canvas element to mount in the DOM. */
  public get domElement(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  public getCurrentFogState(): FogState {
    return this.currentFogState;
  }

  /**
   * Applies the active fog/background settings. Reuses a single Fog
   * instance and background Color so no per-frame Three.js object churn is
   * introduced.
   */
  public setFogState(state: FogState): void {
    this.currentFogState = state;

    this.backgroundColor.setHex(state.colorHex);

    if (state.enabled) {
      this.fog.color.setHex(state.colorHex);
      this.fog.near = state.near;
      this.fog.far = state.far;
      this.scene.fog = this.fog;
    } else {
      this.scene.fog = null;
    }
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
