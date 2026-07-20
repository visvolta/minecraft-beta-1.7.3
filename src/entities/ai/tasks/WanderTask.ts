import type { AiTask } from '../AiTask';
import { ControlFlags } from '../AiTask';
import type { LivingEntity } from '../../living/LivingEntity';

/**
 * Random wandering (Beta `EntityCreature.updateWanderPath`). Occasionally
 * picks a nearby, grass-preferred destination and pathfinds to it. Higher
 * priority than idle-looking; claims Move + Look while a path is active.
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
    let bestX = 0;
    let bestY = 0;
    let bestZ = 0;
    let bestWeight = -Infinity;
    let found = false;

    // Beta samples 10 candidate cells within ±6 X/Z and ±3 Y, choosing the
    // highest-weighted (grass-preferred) one.
    for (let i = 0; i < 10; i++) {
      const x = Math.floor(entity.position.x + entity.nextInt(13) - 6);
      const y = Math.floor(entity.position.y + entity.nextInt(7) - 3);
      const z = Math.floor(entity.position.z + entity.nextInt(13) - 6);
      const weight = entity.getBlockPathWeight(x, y, z);
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
