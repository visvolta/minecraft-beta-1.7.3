/**
 * Chunk mesh vertex layout.
 *
 * Two layouts exist, so ordinary terrain vertices never carry fluid-only data:
 *
 *   General (terrain / cutout / leaves / translucent):
 *     position   float32 x3   12 B
 *     uv         float32 x2    8 B
 *     tintColor  float32 x3   12 B
 *     packedLight uint8  x4    4 B  (normalized: sky, block, ao, faceBrightness)
 *                              = 36 B / vertex
 *
 *   Fluid (water / lava / fire) additionally carries:
 *     fluidTextureKind float32 x1  4 B
 *     fluidFrameUv     float32 x2  8 B
 *                                  = 48 B / vertex
 *
 * Previously every pass carried 27 floats (108 B/vertex), including `normal`
 * (never read — all chunk materials are unlit MeshBasicMaterial), the
 * `debugColor`/`aoColor` channels used only by the removed F4/F7 debug modes,
 * a `normalColor` that the vertex shader immediately overwrote, and fluid
 * attributes on every pass.
 *
 * Positions and UVs stay as plain float32 by design; only the light/AO/
 * brightness scalars are packed.
 */

/** Bytes per vertex for the general (non-fluid) layout. */
export const GENERAL_VERTEX_BYTES = 3 * 4 + 2 * 4 + 3 * 4 + 4;

/** Bytes per vertex for the fluid/fire layout. */
export const FLUID_VERTEX_BYTES = GENERAL_VERTEX_BYTES + 4 + 2 * 4;

/** Beta light levels are 0..15, stored in a normalized byte. */
export const MAX_LIGHT_LEVEL = 15;

/**
 * Ambient-occlusion factor range produced by the mesher. `vertexAO` returns
 * 0..3, which the mesher normalizes to 0..1 before packing.
 */
export const MAX_AO_FACTOR = 1;

/**
 * Encode a light/AO/brightness quad into four normalized bytes.
 *
 * Layout: [sky, block, ao, faceBrightness].
 *
 * - `sky` / `block` are Beta light levels 0..15, scaled to 0..255 so the GPU's
 *   normalization returns level/15 exactly (255/17 == 15).
 * - `ao` and `faceBrightness` are 0..1 factors scaled to 0..255.
 *
 * Using 17 as the light multiplier keeps every one of the 16 discrete Beta
 * light levels exactly representable, so packing is lossless for lighting.
 */
export function packLightByte(level: number): number {
  const clamped = level < 0 ? 0 : level > MAX_LIGHT_LEVEL ? MAX_LIGHT_LEVEL : level;
  return Math.round(clamped) * 17;
}

/** Inverse of {@link packLightByte}: byte -> Beta light level 0..15. */
export function unpackLightByte(byte: number): number {
  return byte / 17;
}

/** Encode a 0..1 factor into a normalized byte. */
export function packUnitByte(value: number): number {
  const clamped = value < 0 ? 0 : value > 1 ? 1 : value;
  return Math.round(clamped * 255);
}

/** Inverse of {@link packUnitByte}: byte -> 0..1 factor. */
export function unpackUnitByte(byte: number): number {
  return byte / 255;
}

/**
 * Maximum absolute error introduced by {@link packUnitByte} round-tripping a
 * 0..1 factor. Half a quantization step.
 */
export const UNIT_BYTE_EPSILON = 0.5 / 255;
