/**
 * Beta's underwater screen overlay.
 *
 * Beta (`EntityRenderer.renderWarpedTextureOverlay` / the `water.png` misc
 * texture) draws a tiled 16x16 overlay across the whole viewport whenever the
 * camera is inside water, tinted toward the water colour at low opacity. It is
 * a screen effect layered *on top of* the normal world render: it does not
 * replace, and must not be used instead of, correct world water rendering.
 *
 * Implemented as a DOM layer for the same reason `SleepOverlayRenderer` is:
 * it needs no WebGL state changes, cannot disturb the depth pre-pass or the
 * entity render order, and scales to the viewport for free.
 */

/** Beta's underwater tint, applied over the tiled overlay texture. */
export const UNDERWATER_TINT_COLOUR = 0x0a1a3f;
/** Requested overlay strength (~15%). */
export const UNDERWATER_OVERLAY_OPACITY = 0.15;
/**
 * Tile size in CSS pixels. The source asset is 16x16; drawing it at 64px keeps
 * the pixel-art texel grid visible at any resolution rather than dissolving
 * into noise on a high-DPI display.
 */
export const UNDERWATER_OVERLAY_TILE_PX = 64;

export class UnderwaterOverlayRenderer {
  private readonly element: HTMLDivElement | null;
  private visible = false;

  public constructor(texturePath = '/textures/misc/water_overlay.png') {
    if (typeof document === 'undefined') {
      this.element = null;
      return;
    }
    const overlay = document.createElement('div');
    overlay.id = 'underwater-overlay';
    const hex = UNDERWATER_TINT_COLOUR.toString(16).padStart(6, '0');
    overlay.style.cssText = [
      'position:fixed',
      // `inset:0` scales to the viewport at any resolution automatically.
      'inset:0',
      // Above the world, below the HUD/menus (sleep overlay sits at 400).
      'z-index:250',
      'pointer-events:none',
      `background-color:#${hex}`,
      `background-image:url('${texturePath}')`,
      'background-repeat:repeat',
      `background-size:${UNDERWATER_OVERLAY_TILE_PX}px ${UNDERWATER_OVERLAY_TILE_PX}px`,
      // Keep the 16x16 source crisp instead of smoothing it.
      'image-rendering:pixelated',
      `opacity:${UNDERWATER_OVERLAY_OPACITY}`,
      'display:none',
    ].join(';');
    document.body.append(overlay);
    this.element = overlay;
  }

  /**
   * Shows the overlay only while the camera itself is submerged. Called every
   * frame; the DOM is only touched when the state actually flips, so leaving
   * the water hides it on the very next frame.
   */
  public setSubmerged(submerged: boolean): void {
    if (this.element === null || submerged === this.visible) return;
    this.visible = submerged;
    this.element.style.display = submerged ? 'block' : 'none';
  }

  public isVisible(): boolean {
    return this.visible;
  }

  public dispose(): void {
    this.element?.remove();
  }
}

/**
 * Whether the camera eye position is inside a water block.
 *
 * Kept as a free function so it can be unit-tested without a DOM: the
 * renderer above is purely presentational.
 */
export function isCameraSubmerged(
  eyeX: number,
  eyeY: number,
  eyeZ: number,
  getBlock: (x: number, y: number, z: number) => number,
  isWaterBlockId: (id: number) => boolean,
): boolean {
  return isWaterBlockId(getBlock(Math.floor(eyeX), Math.floor(eyeY), Math.floor(eyeZ)));
}
