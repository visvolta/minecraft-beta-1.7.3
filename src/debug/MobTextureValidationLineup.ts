export interface MobTextureValidationView {
  readonly name: 'front' | 'back' | 'left' | 'right' | 'above' | 'below';
  readonly yawDegrees: number;
  readonly pitchDegrees: number;
}

/**
 * Deterministic inspection camera directions used by the mob texture validation
 * harness. Kept as data so validation and any future debug lineup view agree on
 * the same six orthogonal model orientations.
 */
export const MOB_TEXTURE_VALIDATION_VIEWS: readonly MobTextureValidationView[] = [
  { name: 'front', yawDegrees: 0, pitchDegrees: 0 },
  { name: 'back', yawDegrees: 180, pitchDegrees: 0 },
  { name: 'left', yawDegrees: -90, pitchDegrees: 0 },
  { name: 'right', yawDegrees: 90, pitchDegrees: 0 },
  { name: 'above', yawDegrees: 0, pitchDegrees: -90 },
  { name: 'below', yawDegrees: 0, pitchDegrees: 90 },
];
