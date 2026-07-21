import * as THREE from 'three';

/** Shared minimum visibility for textured voxel surfaces. */
export const TEXTURE_MIN_BRIGHTNESS = 0.015;

/** Beta 1.7.3 voxel brightness curve (Chunk.getLightBrightnessTable). */
export function getLightBrightness(lightLevel: number): number {
  const clamped = THREE.MathUtils.clamp(lightLevel, 0, 15);
  const darkness = 1 - clamped / 15;
  return (1 - darkness) / (darkness * 3 + 1);
}

export function clampedVisibility(rawBrightness: number, ao: number): number {
  const clampedLight = rawBrightness < TEXTURE_MIN_BRIGHTNESS ? TEXTURE_MIN_BRIGHTNESS : rawBrightness;
  return clampedLight * ao;
}
