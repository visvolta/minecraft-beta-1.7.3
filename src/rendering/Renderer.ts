import * as THREE from 'three';
import type { FogState } from './FogController';
import { OVERWORLD_FOG_COLOR, overworldFogDensity } from './FogController';
import { AntiAliasPipeline, type AaMode } from './AntiAliasPipeline';

const CAMERA_FOV = 70;
const CAMERA_NEAR = 0.05;
/**
 * Stage 18: bumped to 1024 to safely cover the new celestial-sphere
 * radius (480 blocks + star quads a few units past that). The old 512
 * would clip the far edge of the star field where it approaches the
 * camera-far plane.
 */
const CAMERA_FAR = 1024;
const PIXEL_RATIO = 1;

function readFancyGraphicsSetting(): boolean {
  try {
    return window.localStorage.getItem('minecraft.graphics') !== 'fast';
  } catch {
    return true;
  }
}

/**
 * Owns the Three.js scene, camera, and WebGL renderer.
 * Rendering and resize only — the Engine owns the game loop.
 *
 * Stage 17B: the scene fog can now be `FogExp2` (overworld) OR `Fog`
 * (linear, used for water/lava). We keep one instance of each and
 * swap `scene.fog` between them based on `FogState.kind`. Reassigning
 * `scene.fog` when the material has already been compiled with a
 * different fog type would normally require a shader recompile — we
 * avoid that by ONLY switching between compatible variants at the
 * boundaries the shader was compiled for (see ChunkRenderer's height-
 * aware fog injection notes).
 */
export class Renderer {
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.PerspectiveCamera;
  public readonly renderer: THREE.WebGLRenderer;

  private readonly backgroundColor = new THREE.Color(OVERWORLD_FOG_COLOR);
  private readonly exp2Fog = new THREE.FogExp2(OVERWORLD_FOG_COLOR, overworldFogDensity());
  private readonly linearFog = new THREE.Fog(OVERWORLD_FOG_COLOR, 1, 2);
  private currentFogState: FogState = {
    mode: 'overworld',
    kind: 'exp2',
    enabled: true,
    colorHex: OVERWORLD_FOG_COLOR,
    near: 0,
    far: 64,
    density: overworldFogDensity(),
  };

  /**
   * Beta graphics setting bridge. `fast` uses precipitation radius 5;
   * fancy/default uses radius 10. A future UI can own this value; for now
   * localStorage lets the renderer read a real setting without hardcoding
   * the weather radius in PrecipitationRenderer.
   */
  private readonly fancyGraphics = readFancyGraphicsSetting();
  private readonly aaPipeline: AntiAliasPipeline;
  private renderScale = 1;
  private aaMode: AaMode = 'off';

  private readonly onResizeBound = (): void => {
    this.handleResize();
  };

  public constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = this.backgroundColor;
    this.scene.fog = this.exp2Fog;

    this.camera = new THREE.PerspectiveCamera(
      CAMERA_FOV,
      window.innerWidth / window.innerHeight,
      CAMERA_NEAR,
      CAMERA_FAR,
    );

    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.renderer.autoClear = false; // We handle clearing manually now
    this.renderer.setPixelRatio(PIXEL_RATIO);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.aaPipeline = new AntiAliasPipeline(this.renderer, this.scene, this.camera);
  }

  /** Canvas element to mount in the DOM. */
  public get domElement(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  public getCurrentFogState(): FogState {
    return this.currentFogState;
  }

  public isFancyGraphicsEnabled(): boolean {
    return this.fancyGraphics;
  }

  /**
   * Applies the active fog/background settings. Reuses the two fog
   * instances so no per-frame Three.js object churn is introduced;
   * only `scene.fog` may switch reference when a material moves between
   * water/lava (linear) and overworld (exp2).
   *
   * Note on shader recompiles: assigning `scene.fog` to a different
   * fog class (Fog ↔ FogExp2) DOES flip Three's `USE_FOG_EXP2` shader
   * define. Materials that were compiled with one fog kind and then
   * see the other will silently re-compile at next `renderer.render()`.
   * Cost: a handful of shader compiles the first time the player
   * enters water/lava, then cached forever.
   */
  /** Current fog state, for diagnostics and the F3 overlay. */
  public getFogState(): FogState {
    return this.currentFogState;
  }

  /** Scene clear/background colour as 0xRRGGBB, for diagnostics. */
  public getBackgroundHex(): number {
    return this.backgroundColor.getHex();
  }

  public setFogState(state: FogState): void {
    this.currentFogState = state;

    this.backgroundColor.setHex(state.colorHex);

    if (!state.enabled) {
      this.scene.fog = null;
      return;
    }

    if (state.kind === 'exp2') {
      this.exp2Fog.color.setHex(state.colorHex);
      this.exp2Fog.density = state.density;
      this.scene.fog = this.exp2Fog;
    } else if (state.kind === 'linear') {
      this.linearFog.color.setHex(state.colorHex);
      this.linearFog.near = state.near;
      this.linearFog.far = state.far;
      this.scene.fog = this.linearFog;
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

  public dispose(): void {
    this.stop();
    this.aaPipeline.dispose();
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  /**
   * Draw-call/triangle totals for the WORLD scene pass of the last frame.
   *
   * `WebGLRenderer.info.render` is reset on every `render()` call, and with AA
   * enabled the EffectComposer's fullscreen post passes run last — so sampling
   * `info` after `render()` reported the post-processing quad (2 calls, 13
   * triangles) instead of the terrain. Captured here, immediately after the
   * scene pass, before any post/HUD pass can overwrite it.
   */
  public lastWorldDrawCalls = 0;
  public lastWorldTriangles = 0;

  /** World render only — call HUD/UI after this so AA does not blur GUI. */
  public render(): void {
    if (this.aaMode === 'off') {
      this.renderer.render(this.scene, this.camera);
      this.captureWorldStats();
      return;
    }
    this.aaPipeline.render(() => this.captureWorldStats());
  }

  private captureWorldStats(): void {
    this.lastWorldDrawCalls = this.renderer.info.render.calls;
    this.lastWorldTriangles = this.renderer.info.render.triangles;
  }

  public setAaMode(mode: AaMode): void {
    this.aaMode = mode;
    this.aaPipeline.setMode(mode);
    this.handleResize();
  }

  public setRenderScale(scale: number): void {
    this.renderScale = Math.max(0.5, Math.min(1.5, scale));
    this.handleResize();
  }

  public getAaMode(): AaMode {
    return this.aaMode;
  }

  public getRenderScale(): number {
    return this.renderScale;
  }

  private handleResize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const pr = PIXEL_RATIO * this.renderScale;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(width, height);
    this.aaPipeline.setSize(width, height, pr);
  }
}
