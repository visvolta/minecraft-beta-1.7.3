import type { LivingEntity } from '../entities/living/LivingEntity';

/** Beta `getCollisionBorderSize`: entity boxes are expanded slightly for targeting. */
const COLLISION_BORDER = 0.1;

export interface MeleeTarget {
  readonly entity: LivingEntity;
  readonly distance: number;
}

/**
 * Selects the nearest valid living entity hit by the look ray within `reach`,
 * mirroring Beta `EntityRenderer.getMouseOver` entity picking: each candidate's
 * AABB is expanded by a small collision border and tested with a ray; the
 * closest hit within reach wins. Candidates are expected to be pre-filtered to
 * alive, collidable living entities (parked/removed/dead/items excluded).
 *
 * Pure and headless-testable: the caller (InteractionController) supplies the
 * candidates from a chunk-first spatial query and the reach (already capped at
 * the block-hit distance so attacks cannot pass through walls).
 */
export function selectMeleeTarget(
  eye: { x: number; y: number; z: number },
  look: { x: number; y: number; z: number },
  reach: number,
  candidates: readonly LivingEntity[],
): MeleeTarget | undefined {
  let best: MeleeTarget | undefined;
  for (const entity of candidates) {
    const box = entity.getAABB().expand(COLLISION_BORDER, COLLISION_BORDER, COLLISION_BORDER);
    const hit = box.intersectRay(eye.x, eye.y, eye.z, look.x, look.y, look.z);
    if (hit !== undefined && hit.distance <= reach) {
      if (best === undefined || hit.distance < best.distance) {
        best = { entity, distance: hit.distance };
      }
    }
  }
  return best;
}
