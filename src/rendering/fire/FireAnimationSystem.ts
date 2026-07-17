/**
 * Beta 1.7.3 fire animation system.
 *
 * Manages the fire sprite sheet texture and frame timing.
 * Fire_layer_0.png is a vertical strip of 16x16 frames (32 total).
 * The mcmeta defines frame order: 16-31 then 0-15.
 *
 * Frame timing matches Beta: each game tick advances the animation.
 * The system tracks the current frame index and provides it to the
 * fire material's shader for UV offset computation.
 */

import * as THREE from 'three';

export class FireAnimationSystem {
  public readonly fireTexture: THREE.Texture;
  private currentFrame = 0;
  private readonly frameCount = 32;
  private readonly frameOrder: readonly number[];

  public constructor() {
    const loader = new THREE.TextureLoader();
    this.fireTexture = loader.load('/textures/blocks/fire_layer_0.png', (texture) => {
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.generateMipmaps = false;
      texture.flipY = false;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
    });

    // Configure immediately for already-loaded texture
    this.fireTexture.magFilter = THREE.NearestFilter;
    this.fireTexture.minFilter = THREE.NearestFilter;
    this.fireTexture.wrapS = THREE.ClampToEdgeWrapping;
    this.fireTexture.wrapT = THREE.ClampToEdgeWrapping;
    this.fireTexture.generateMipmaps = false;
    this.fireTexture.flipY = false;
    this.fireTexture.colorSpace = THREE.SRGBColorSpace;

    // Beta mcmeta frame order: 16-31 then 0-15
    this.frameOrder = [
      16, 17, 18, 19, 20, 21, 22, 23,
      24, 25, 26, 27, 28, 29, 30, 31,
      0, 1, 2, 3, 4, 5, 6, 7,
      8, 9, 10, 11, 12, 13, 14, 15,
    ];
  }

  /**
   * Updates the current animation frame based on game ticks.
   * Called once per frame by ChunkRenderer.
   *
   * @param totalGameTicks - Total game ticks elapsed
   */
  public update(totalGameTicks: number): void {
    // Beta advances fire animation every 1 tick (not every 2 like water)
    this.currentFrame = Math.floor(totalGameTicks) % this.frameCount;
  }

  /**
   * Returns the current fire frame index (0-31) in the sprite sheet.
   */
  public getFrame(): number {
    return this.frameOrder[this.currentFrame] ?? 0;
  }

  /**
   * Returns the number of frames in the sprite sheet.
   */
  public getFrameCount(): number {
    return this.frameCount;
  }

  /**
   * Returns debug info for the F3 overlay.
   */
  public getDebugInfo(): { frame: number; frameCount: number } {
    return {
      frame: this.getFrame(),
      frameCount: this.frameCount,
    };
  }

  public dispose(): void {
    this.fireTexture.dispose();
  }
}
