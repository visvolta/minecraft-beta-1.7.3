import * as THREE from 'three';

/**
 * Beta 1.7.3 Nether portal animation.
 *
 * `TexturePortalFX` procedurally generates 32 frames of 16x16 and advances one
 * frame per tick (`portalTickCounter & 31`). The shipped `portal.png` is a
 * 16x512 vertical strip holding exactly those 32 frames, so the asset is used
 * directly instead of regenerating the swirl at runtime.
 *
 * The portal texture cannot live in the block atlas: the atlas packs a single
 * 16x16 tile per texture and would keep only frame 0. Like the fluid and fire
 * systems, the portal owns a standalone texture sampled by its own material.
 *
 * One system drives every portal mesh through a shared frame uniform, so
 * animating never rebuilds geometry and never needs a per-portal material.
 */
export class PortalAnimationSystem {
  /** Beta advances the portal texture one frame per game tick. */
  public static readonly FRAME_COUNT = 32;
  public static readonly TICKS_PER_FRAME = 1;

  public readonly portalTexture: THREE.Texture;

  private frame = 0;

  public constructor() {
    const loader = new THREE.TextureLoader();
    this.portalTexture = loader.load('/textures/blocks/portal.png', (texture) => this.configure(texture));
    this.configure(this.portalTexture);
  }

  /** Advances the animation from the shared world clock. */
  public update(totalGameTicks: number): void {
    this.frame = Math.floor(totalGameTicks / PortalAnimationSystem.TICKS_PER_FRAME) % PortalAnimationSystem.FRAME_COUNT;
  }

  public getFrame(): number {
    return this.frame;
  }

  public getFrameCount(): number {
    return PortalAnimationSystem.FRAME_COUNT;
  }

  public applyUniforms(uniforms: {
    uPortalTexture?: { value: THREE.Texture };
    uPortalFrame?: { value: number };
    uPortalFrameCount?: { value: number };
  }): void {
    if (uniforms.uPortalTexture) uniforms.uPortalTexture.value = this.portalTexture;
    if (uniforms.uPortalFrame) uniforms.uPortalFrame.value = this.frame;
    if (uniforms.uPortalFrameCount) uniforms.uPortalFrameCount.value = PortalAnimationSystem.FRAME_COUNT;
  }

  public dispose(): void {
    this.portalTexture.dispose();
  }

  private configure(texture: THREE.Texture): void {
    // Beta pixel-art filtering; the strip wraps vertically as frames advance.
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;
    texture.needsUpdate = true;
  }
}
