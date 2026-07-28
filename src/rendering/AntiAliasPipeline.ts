import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export type AaMode = 'smaa' | 'fxaa' | 'off';

/**
 * Optional post-process AA for the world scene.
 * UI/HUD should be drawn after {@link render} so it stays sharp.
 */
export class AntiAliasPipeline {
  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private fxaa: FXAAPass | null = null;
  private smaa: SMAAPass | null = null;
  private output: OutputPass | null = null;
  private mode: AaMode = 'off';
  private width = 1;
  private height = 1;
  private pixelRatio = 1;

  public constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
  ) {}

  public setMode(mode: AaMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.rebuild();
  }

  public getMode(): AaMode {
    return this.mode;
  }

  public setSize(width: number, height: number, pixelRatio: number): void {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.pixelRatio = pixelRatio;
    if (this.composer) {
      this.composer.setSize(this.width, this.height);
      this.composer.setPixelRatio(pixelRatio);
      this.fxaa?.setSize(this.width * pixelRatio, this.height * pixelRatio);
      this.smaa?.setSize(this.width * pixelRatio, this.height * pixelRatio);
    }
  }

  public render(): void {
    if (this.mode === 'off' || this.composer === null) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.composer.render();
  }

  public dispose(): void {
    this.composer?.dispose();
    this.composer = null;
    this.renderPass = null;
    this.fxaa = null;
    this.smaa = null;
    this.output = null;
  }

  private rebuild(): void {
    this.dispose();
    if (this.mode === 'off') return;

    this.composer = new EffectComposer(this.renderer);
    this.composer.setSize(this.width, this.height);
    this.composer.setPixelRatio(this.pixelRatio);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    if (this.mode === 'fxaa') {
      this.fxaa = new FXAAPass();
      this.fxaa.setSize(this.width * this.pixelRatio, this.height * this.pixelRatio);
      this.composer.addPass(this.fxaa);
    } else if (this.mode === 'smaa') {
      this.smaa = new SMAAPass();
      this.smaa.setSize(this.width * this.pixelRatio, this.height * this.pixelRatio);
      this.composer.addPass(this.smaa);
    }

    this.output = new OutputPass();
    this.composer.addPass(this.output);
  }
}
