import * as THREE from 'three';

export interface FluidAnimationDescriptor {
  readonly key: string;
  readonly path: string;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly frameCount: number;
  readonly ticksPerFrame: number;
}

export class FluidAnimationSystem {
  public readonly waterStillDescriptor: FluidAnimationDescriptor;
  public readonly waterFlowDescriptor: FluidAnimationDescriptor;
  public readonly lavaStillDescriptor: FluidAnimationDescriptor;
  public readonly lavaFlowDescriptor: FluidAnimationDescriptor;

  public readonly waterStillTexture: THREE.Texture;
  public readonly waterFlowTexture: THREE.Texture;
  public readonly lavaStillTexture: THREE.Texture;
  public readonly lavaFlowTexture: THREE.Texture;

  private waterStillFrame = 0;
  private waterFlowFrame = 0;
  private lavaStillFrame = 0;
  private lavaFlowFrame = 0;

  public constructor() {
    this.waterStillDescriptor = {
      key: 'water_still',
      path: '/textures/blocks/water_still.png',
      frameWidth: 16,
      frameHeight: 16,
      frameCount: 32,
      ticksPerFrame: 2,
    };
    this.waterFlowDescriptor = {
      key: 'water_flow',
      path: '/textures/blocks/water_flow.png',
      frameWidth: 32,
      frameHeight: 32,
      frameCount: 32,
      ticksPerFrame: 2,
    };
    this.lavaStillDescriptor = {
      key: 'lava_still',
      path: '/textures/blocks/lava_still.png',
      frameWidth: 16,
      frameHeight: 16,
      frameCount: 20,
      ticksPerFrame: 3,
    };
    this.lavaFlowDescriptor = {
      key: 'lava_flow',
      path: '/textures/blocks/lava_flow.png',
      frameWidth: 32,
      frameHeight: 32,
      frameCount: 16,
      ticksPerFrame: 3,
    };

    const loader = new THREE.TextureLoader();
    this.waterStillTexture = loader.load(this.waterStillDescriptor.path, (texture) => this.configure(texture));
    this.waterFlowTexture = loader.load(this.waterFlowDescriptor.path, (texture) => this.configure(texture));
    this.lavaStillTexture = loader.load(this.lavaStillDescriptor.path, (texture) => this.configure(texture));
    this.lavaFlowTexture = loader.load(this.lavaFlowDescriptor.path, (texture) => this.configure(texture));
    this.configure(this.waterStillTexture);
    this.configure(this.waterFlowTexture);
    this.configure(this.lavaStillTexture);
    this.configure(this.lavaFlowTexture);
  }

  public update(totalGameTicks: number): void {
    this.waterStillFrame = Math.floor(totalGameTicks / this.waterStillDescriptor.ticksPerFrame) % this.waterStillDescriptor.frameCount;
    this.waterFlowFrame = Math.floor(totalGameTicks / this.waterFlowDescriptor.ticksPerFrame) % this.waterFlowDescriptor.frameCount;
    this.lavaStillFrame = Math.floor(totalGameTicks / this.lavaStillDescriptor.ticksPerFrame) % this.lavaStillDescriptor.frameCount;
    this.lavaFlowFrame = Math.floor(totalGameTicks / this.lavaFlowDescriptor.ticksPerFrame) % this.lavaFlowDescriptor.frameCount;
  }

  public applyUniforms(uniforms: {
    uWaterStillTexture?: { value: THREE.Texture };
    uWaterFlowTexture?: { value: THREE.Texture };
    uLavaStillTexture?: { value: THREE.Texture };
    uLavaFlowTexture?: { value: THREE.Texture };
    uWaterStillFrame?: { value: number };
    uWaterFlowFrame?: { value: number };
    uLavaStillFrame?: { value: number };
    uLavaFlowFrame?: { value: number };
    uWaterStillFrameCount?: { value: number };
    uWaterFlowFrameCount?: { value: number };
    uLavaStillFrameCount?: { value: number };
    uLavaFlowFrameCount?: { value: number };
  }): void {
    if (uniforms.uWaterStillTexture) uniforms.uWaterStillTexture.value = this.waterStillTexture;
    if (uniforms.uWaterFlowTexture) uniforms.uWaterFlowTexture.value = this.waterFlowTexture;
    if (uniforms.uLavaStillTexture) uniforms.uLavaStillTexture.value = this.lavaStillTexture;
    if (uniforms.uLavaFlowTexture) uniforms.uLavaFlowTexture.value = this.lavaFlowTexture;
    if (uniforms.uWaterStillFrame) uniforms.uWaterStillFrame.value = this.waterStillFrame;
    if (uniforms.uWaterFlowFrame) uniforms.uWaterFlowFrame.value = this.waterFlowFrame;
    if (uniforms.uLavaStillFrame) uniforms.uLavaStillFrame.value = this.lavaStillFrame;
    if (uniforms.uLavaFlowFrame) uniforms.uLavaFlowFrame.value = this.lavaFlowFrame;
    if (uniforms.uWaterStillFrameCount) uniforms.uWaterStillFrameCount.value = this.waterStillDescriptor.frameCount;
    if (uniforms.uWaterFlowFrameCount) uniforms.uWaterFlowFrameCount.value = this.waterFlowDescriptor.frameCount;
    if (uniforms.uLavaStillFrameCount) uniforms.uLavaStillFrameCount.value = this.lavaStillDescriptor.frameCount;
    if (uniforms.uLavaFlowFrameCount) uniforms.uLavaFlowFrameCount.value = this.lavaFlowDescriptor.frameCount;
  }

  public getWaterFrame(): number {
    return this.waterFlowFrame;
  }

  public getLavaFrame(): number {
    return this.lavaFlowFrame;
  }

  public getDebugInfo(): {
    readonly waterStillFrame: number;
    readonly waterFlowFrame: number;
    readonly lavaStillFrame: number;
    readonly lavaFlowFrame: number;
    readonly descriptors: readonly FluidAnimationDescriptor[];
  } {
    return {
      waterStillFrame: this.waterStillFrame,
      waterFlowFrame: this.waterFlowFrame,
      lavaStillFrame: this.lavaStillFrame,
      lavaFlowFrame: this.lavaFlowFrame,
      descriptors: [this.waterStillDescriptor, this.waterFlowDescriptor, this.lavaStillDescriptor, this.lavaFlowDescriptor],
    };
  }

  public dispose(): void {
    this.waterStillTexture.dispose();
    this.waterFlowTexture.dispose();
    this.lavaStillTexture.dispose();
    this.lavaFlowTexture.dispose();
  }

  private configure(texture: THREE.Texture): void {
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    // Frame-local UVs must not wrap into a neighbouring animation frame
    // when Beta's rotated top coordinates extend beyond 0..1.
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    texture.flipY = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    if (hasTextureImageData(texture)) texture.needsUpdate = true;
  }
}

function hasTextureImageData(texture: THREE.Texture): boolean {
  const image = texture.image as { width?: unknown; height?: unknown; data?: unknown } | undefined;
  return image != null && (
    (typeof image.width === 'number' && image.width > 0 && typeof image.height === 'number' && image.height > 0)
    || image.data !== undefined
  );
}
