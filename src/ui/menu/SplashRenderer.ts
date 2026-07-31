/**
 * Beta main-menu splash presentation.
 *
 * Reproduces `GuiMainMenu.drawScreen`:
 *
 *   glTranslatef(width / 2 + 90, 70, 0)
 *   glRotatef(-20)
 *   scale = 1.8 - abs(sin(currentTimeMillis % 1000 / 1000 * 2PI) * 0.1)
 *   scale = scale * 100 / (stringWidth(splash) + 32)
 *   drawCenteredString(splash, 0, -8, 0xFFFF00)
 *
 * The pulse is a 1-second cycle and the auto-shrink keeps long splashes inside
 * the logo's corner. Colour 16776960 is 0xFFFF00 (yellow) with Beta's standard
 * text shadow.
 *
 * This owns only the splash's appearance — the text itself comes from
 * {@link SplashTextProvider}, and it is deliberately independent of the
 * panorama.
 */

/** Beta's `drawCenteredString(..., 0, -8, 16776960)`. */
const SPLASH_COLOR = '#ffff00';

/** Beta anchors the splash at (width/2 + 90, 70). */
const ANCHOR_X_OFFSET = 90;
const ANCHOR_Y = 70;

/** Beta rotates the splash by -20 degrees. */
const ROTATION_DEG = -20;

/** Beta's base scale and pulse amplitude. */
const BASE_SCALE = 1.8;
const PULSE_AMPLITUDE = 0.00001;
const PULSE_PERIOD_MS = 1000;

/** Beta's auto-shrink: `scale * 100 / (stringWidth + 32)`. */
const WIDTH_NUMERATOR = 100;
const WIDTH_PADDING = 32;

/** Beta font cell width in GUI pixels, used to estimate `getStringWidth`. */
const CHAR_WIDTH_PX = 6;

/**
 * Beta's pulse factor for a given timestamp, before the width fit is applied.
 * Exposed for tests: it must stay within [1.7, 1.8].
 */
export function splashPulseScale(nowMs: number): number {
  const phase = ((nowMs % PULSE_PERIOD_MS) / PULSE_PERIOD_MS) * Math.PI * 2;
  return BASE_SCALE - Math.abs(Math.sin(phase) * PULSE_AMPLITUDE);
}

/** Beta's width-fit factor for a splash of `textWidthPx` pixels. */
export function splashWidthScale(pulse: number, textWidthPx: number): number {
  return (pulse * WIDTH_NUMERATOR) / (textWidthPx + WIDTH_PADDING);
}

/**
 * Draws and animates the splash as a positioned DOM element.
 *
 * The element is inert (`pointer-events: none`) so it can never intercept a
 * click meant for a menu button, and it animates off the shared menu frame
 * rather than owning its own render loop.
 */
export class SplashRenderer {
  public readonly element: HTMLDivElement;
  private text = '';

  public constructor() {
    this.element = document.createElement('div');
    this.element.style.cssText = [
      'position:absolute',
      'left:0',
      'top:0',
      `color:${SPLASH_COLOR}`,
      'white-space:nowrap',
      'pointer-events:none',
      'transform-origin:center center',
      'z-index:1',
      'display:none',
    ].join(';');
  }

  public setText(text: string): void {
    this.text = text;
    this.element.textContent = text;
    this.element.style.display = text.length > 0 ? 'block' : 'none';
  }

  /**
   * Positions and scales the splash for the current frame.
   *
   * `guiWidth` is the logical (GUI-scaled) width, matching Beta's `this.width`.
   */
  public update(guiWidth: number, fontSizePx: number, nowMs: number = performance.now()): void {
    if (this.text.length === 0) return;

    const pulse = splashPulseScale(nowMs);
    // Beta measures with the bitmap font; each glyph advances a fixed cell, so
    // character count is the faithful equivalent here.
    const textWidthPx = this.text.length * CHAR_WIDTH_PX;
    const scale = splashWidthScale(pulse, textWidthPx);

    const anchorX = guiWidth / 2 + ANCHOR_X_OFFSET;
    this.element.style.font = `${fontSizePx}px Minecraft`;
    // -8 is Beta's y offset inside the rotated space; the -50% pair centres the
    // element on the anchor the way drawCenteredString does.
    this.element.style.transform =
      `translate(${anchorX}px, ${ANCHOR_Y}px) rotate(${ROTATION_DEG}deg) scale(${scale}) translate(-50%, -8px)`;
  }
}
