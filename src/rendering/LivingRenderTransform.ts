import type { Object3D } from 'three';
import { wrapDegrees } from '../entities/living/LivingAnimationMath';

/** Single model-boundary conversion: entity yaw 0/+Z to Three.js local +Z. */
export function interpolateLivingBodyYaw(previousDegrees: number, currentDegrees: number, alpha: number): number {
  return previousDegrees + wrapDegrees(currentDegrees - previousDegrees) * alpha;
}

export function applyLivingRootYaw(root: Object3D, previousDegrees: number, currentDegrees: number, alpha: number): number {
  const bodyYaw = interpolateLivingBodyYaw(previousDegrees, currentDegrees, alpha);
  root.rotation.y = -bodyYaw * Math.PI / 180;
  return bodyYaw;
}
