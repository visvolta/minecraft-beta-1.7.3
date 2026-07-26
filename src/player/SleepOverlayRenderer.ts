import { SLEEP_OVERLAY_COLOUR } from './SleepController';

/**
 * Beta's sleep screen tint.
 *
 * `GuiIngame` fills the viewport with `0x1052704` at an alpha that ramps from
 * 0 to 220/255 as `sleepTimer` climbs to 100, then falls back over the next
 * 10 ticks. A DOM overlay reproduces that without touching the WebGL pipeline.
 */
export class SleepOverlayRenderer {
  private readonly element: HTMLDivElement | null;
  private lastAlpha = -1;

  public constructor() {
    if (typeof document === 'undefined') {
      this.element = null;
      return;
    }
    const overlay = document.createElement('div');
    overlay.id = 'sleep-overlay';
    const hex = SLEEP_OVERLAY_COLOUR.toString(16).padStart(6, '0');
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:400', 'pointer-events:none',
      `background:#${hex}`, 'opacity:0', 'display:none',
    ].join(';');
    document.body.append(overlay);
    this.element = overlay;
  }

  /** `alpha` is 0..1; the renderer only touches the DOM when it changes. */
  public setAlpha(alpha: number): void {
    const element = this.element;
    if (element === null) return;
    const clamped = Math.max(0, Math.min(1, alpha));
    if (Math.abs(clamped - this.lastAlpha) < 0.002) return;
    this.lastAlpha = clamped;
    if (clamped <= 0) {
      element.style.display = 'none';
      element.style.opacity = '0';
      return;
    }
    element.style.display = 'block';
    element.style.opacity = clamped.toFixed(3);
  }

  public dispose(): void {
    this.element?.remove();
  }
}
