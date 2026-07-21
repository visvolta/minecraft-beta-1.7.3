import type { AiTask } from '../AiTask.ts';
import { ControlFlags } from '../AiTask';
import { LivingEntity } from '../../living/LivingEntity';

/** Radius within which nearby animals bias the wander target away (blocks). */
const SPACING_RADIUS = 3;
/** Weight of the spacing repulsion relative to the grass preference. */
const SPACING_WEIGHT = 4;

/**
 * Random wandering (Beta `EntityCreature.updateWanderPath`). Occasionally
 * picks a nearby, grass-preferred destination and pathfinds to it, biased away
 * from overcrowded nearby animals (light passive spacing via a bounded,
 * chunk-first query — no flocking). Higher priority than idle-looking; claims
 * Move + Look while a path is active.
 */
export class WanderTask implements AiTask {
  public readonly priority = 10;
  public readonly controlFlags = ControlFlags.Move | ControlFlags.Look;

  public shouldStart(entity: LivingEntity): boolean {
    // Beta: a ~1/80 per-tick chance to begin wandering when idle.
    return !entity.navigation.hasPath() && entity.nextInt(80) === 0;
  }

  public shouldContinue(entity: LivingEntity): boolean {
    return entity.navigation.hasPath();
  }

  public start(entity: LivingEntity): void {
    // Bounded, chunk-first query for nearby animals to space away from.
    const box = entity.getAABB().expand(SPACING_RADIUS, SPACING_RADIUS, SPACING_RADIUS);
    const nearby = entity.entityManager.getEntitiesInAABB(
      box,
      (other): other is LivingEntity => other instanceof LivingEntity && other !== entity,
    );
    let crowdX = 0;
    let crowdZ = 0;
    for (const other of nearby) {
      crowdX += other.position.x;
      crowdZ += other.position.z;
    }
    const hasCrowd = nearby.length > 0;
    if (hasCrowd) {
      crowdX /= nearby.length;
      crowdZ /= nearby.length;
    }

    let bestX = 0;
    let bestY = 0;
    let bestZ = 0;
    let bestWeight = -Infinity;
    let found = false;

    // Beta samples 10 candidate cells within ±6 X/Z and ±3 Y, choosing the
    // highest-weighted (grass-preferred) one; spacing biases away from crowds.
    for (let i = 0; i < 10; i++) {
      const x = Math.floor(entity.position.x + entity.nextInt(13) - 6);
      const y = Math.floor(entity.position.y + entity.nextInt(7) - 3);
      const z = Math.floor(entity.position.z + entity.nextInt(13) - 6);
      let weight = entity.getBlockPathWeight(x, y, z);
      if (hasCrowd) {
        const awayX = x + 0.5 - crowdX;
        const awayZ = z + 0.5 - crowdZ;
        weight += Math.min(Math.hypot(awayX, awayZ), SPACING_RADIUS) * (SPACING_WEIGHT / SPACING_RADIUS);
      }
      if (weight > bestWeight) {
        bestWeight = weight;
        bestX = x;
        bestY = y;
        bestZ = z;
        found = true;
      }
    }

    if (found) {
      entity.navigation.moveTo(entity, { x: bestX + 0.5, y: bestY, z: bestZ + 0.5 });
    }
  }

  public tick(_entity: LivingEntity): void {
    // Movement is applied by Navigation each tick in LivingEntity.onTick.
  }

  public stop(entity: LivingEntity): void {
    entity.navigation.clearPath();
  }
}
