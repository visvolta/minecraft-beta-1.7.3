/**
 * Packed per-voxel light value: skylight plus RGB block light in one 16-bit word.
 *
 * Layout (documented once, relied on everywhere):
 *
 *   bits  0- 3   skylight   0..15
 *   bits  4- 7   block red  0..15
 *   bits  8-11   block green 0..15
 *   bits 12-15   block blue 0..15
 *
 * Why RGB4
 * --------
 * Beta stores a single grayscale block-light nibble. Coloured light is an
 * intentional, documented DEVIATION from Beta: the gameplay light LEVEL is
 * preserved exactly (see `getBlockLightLevel`), and only the visual tint is
 * new. Four bits per channel is the smallest representation that still gives
 * Beta's full 0..15 attenuation range per channel, and keeps a chunk's light
 * array at 64 KB (Uint16Array) rather than the 96 KB a separate RGB side array
 * would cost.
 *
 * Scalar compatibility
 * --------------------
 * `getBlockLightLevel` returns `max(R, G, B)`. This is deliberate and is NOT a
 * perceptual/luminance weighting: gameplay rules (mob spawning, block ticks,
 * "is this square dark enough") are defined on Beta's 0..15 scale, and a white
 * light of level N must keep reading as exactly N. Using luminance weights
 * would silently shift every one of those thresholds.
 *
 * Every read and write goes through the helpers below. No other module should
 * shift or mask a packed light word; the only sanctioned exception is
 * low-level (de)serialisation, which necessarily speaks the wire format.
 */

/** Maximum value of any single light channel. */
export const MAX_LIGHT = 15;

/** Bit offsets of each channel inside the packed word. */
export const SKY_SHIFT = 0;
export const RED_SHIFT = 4;
export const GREEN_SHIFT = 8;
export const BLUE_SHIFT = 12;

const NIBBLE = 0xf;

/** A block-light colour as three 0..15 channels. */
export interface BlockLightRgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const clampNibble = (value: number): number => (value < 0 ? 0 : value > MAX_LIGHT ? MAX_LIGHT : value | 0);

/** Skylight component (0..15). */
export function getSkyLight(packed: number): number {
  return (packed >> SKY_SHIFT) & NIBBLE;
}

/** Returns `packed` with a new skylight value; block light is untouched. */
export function withSkyLight(packed: number, level: number): number {
  return (packed & ~(NIBBLE << SKY_SHIFT)) | (clampNibble(level) << SKY_SHIFT);
}

export function getRed(packed: number): number { return (packed >> RED_SHIFT) & NIBBLE; }
export function getGreen(packed: number): number { return (packed >> GREEN_SHIFT) & NIBBLE; }
export function getBlue(packed: number): number { return (packed >> BLUE_SHIFT) & NIBBLE; }

/** All three block-light channels. */
export function getBlockLightRgb(packed: number): BlockLightRgb {
  return { r: getRed(packed), g: getGreen(packed), b: getBlue(packed) };
}

/**
 * Scalar block-light level for gameplay: `max(R, G, B)`.
 *
 * Preserves Beta's 0..15 semantics exactly for white light, and gives a
 * coloured source the level of its brightest channel — which is what its
 * emission level was seeded from.
 */
export function getBlockLightLevel(packed: number): number {
  const r = getRed(packed);
  const g = getGreen(packed);
  const b = getBlue(packed);
  return r > g ? (r > b ? r : b) : (g > b ? g : b);
}

/** Returns `packed` with new block-light channels; skylight is untouched. */
export function withBlockLightRgb(packed: number, r: number, g: number, b: number): number {
  return (packed & NIBBLE)
    | (clampNibble(r) << RED_SHIFT)
    | (clampNibble(g) << GREEN_SHIFT)
    | (clampNibble(b) << BLUE_SHIFT);
}

/** Returns `packed` with every block-light channel set to `level` (white). */
export function withBlockLightLevel(packed: number, level: number): number {
  const v = clampNibble(level);
  return withBlockLightRgb(packed, v, v, v);
}

/** Builds a packed word from its four channels. */
export function packLight(sky: number, r: number, g: number, b: number): number {
  return (clampNibble(sky) << SKY_SHIFT)
    | (clampNibble(r) << RED_SHIFT)
    | (clampNibble(g) << GREEN_SHIFT)
    | (clampNibble(b) << BLUE_SHIFT);
}

/** True when no channel carries any light. */
export function isDark(packed: number): boolean {
  return packed === 0;
}

/** True when every block-light channel is zero (skylight ignored). */
export function hasNoBlockLight(packed: number): boolean {
  return (packed & 0xfff0) === 0;
}

/**
 * Per-channel maximum of two packed values' BLOCK light.
 *
 * This is the mixing rule for overlapping coloured sources: each channel takes
 * the brighter of the two, so a red torch beside a yellow torch yields orange
 * in the overlap instead of one source erasing the other. Max is commutative
 * and associative, which makes propagation order-independent.
 */
export function maxBlockLight(a: number, b: number): number {
  const r = Math.max(getRed(a), getRed(b));
  const g = Math.max(getGreen(a), getGreen(b));
  const bl = Math.max(getBlue(a), getBlue(b));
  return withBlockLightRgb(a, r, g, bl);
}
