/**
 * Main-menu panorama blur setting.
 *
 * Beta's own menu blurs the panorama by re-rendering it through a small
 * blur/overlay pass. A CSS `filter: blur()` on the panorama canvas alone is
 * visually equivalent here and costs nothing per frame — the compositor
 * applies it, the render loop is untouched, and no extra render targets or
 * passes are allocated. Crucially the filter is scoped to the canvas, so menu
 * buttons, the logo and text stay sharp.
 */

export type PanoramaBlur = 'off' | 'low' | 'medium' | 'high';

export const PANORAMA_BLUR_ORDER: readonly PanoramaBlur[] = ['off', 'low', 'medium', 'high'];

/** Blur radius in CSS pixels for each level. 0 disables the filter entirely. */
const BLUR_RADIUS_PX: Readonly<Record<PanoramaBlur, number>> = {
  off: 0,
  low: 2,
  medium: 5,
  high: 10,
};

const LABELS: Readonly<Record<PanoramaBlur, string>> = {
  off: 'OFF',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export const DEFAULT_PANORAMA_BLUR: PanoramaBlur = 'medium';

/** Coerces persisted/unknown input to a valid level. */
export function normalizePanoramaBlur(value: unknown): PanoramaBlur {
  return typeof value === 'string' && (PANORAMA_BLUR_ORDER as readonly string[]).includes(value)
    ? (value as PanoramaBlur)
    : DEFAULT_PANORAMA_BLUR;
}

export function panoramaBlurLabel(blur: PanoramaBlur): string {
  return LABELS[blur];
}

/** Cycles to the next level, for the options-screen toggle button. */
export function nextPanoramaBlur(blur: PanoramaBlur): PanoramaBlur {
  const index = PANORAMA_BLUR_ORDER.indexOf(blur);
  return PANORAMA_BLUR_ORDER[(index + 1) % PANORAMA_BLUR_ORDER.length]!;
}

/**
 * The CSS `filter` value for a level. Returns `'none'` at `off` so the
 * compositor skips the filter path completely rather than running a zero-radius
 * blur.
 */
export function panoramaBlurCss(blur: PanoramaBlur): string {
  const radius = BLUR_RADIUS_PX[blur];
  return radius === 0 ? 'none' : `blur(${radius}px)`;
}
