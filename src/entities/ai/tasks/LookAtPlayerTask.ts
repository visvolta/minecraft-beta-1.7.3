import type { AiTask } from '../AiTask';
import { ControlFlags } from '../AiTask';
import type { LivingEntity } from '../../living/LivingEntity';

/** Distance within which a mob notices the player (blocks). */
const NOTICE_RADIUS = 8;
/** Distance beyond which the mob loses interest. */
const LOSE_RADIUS = 10;


/**
 * Reusable task: a passive mob glances at a nearby player by turning its head
 * (head yaw only — the body keeps its own heading). Species configure their own
 * registration/priority; this task holds no species-specific logic. Interrupted
 * by higher-priority tasks (grazing, wandering, panic) via the Look channel.
 */
export class LookAtPlayerTask implements AiTask {
  public readonly priority = 5;
  public readonly controlFlags = ControlFlags.Look;

  public shouldStart(entity: LivingEntity): boolean {
    const player = entity.playerPosition;
    if (!player) {
      return false;
    }
    const dx = player.x - entity.position.x;
    const dz = player.z - entity.position.z;
    if (dx * dx + dz * dz > NOTICE_RADIUS * NOTICE_RADIUS) {
      return false;
    }
    return entity.nextInt(100) < 30;
  }

  public shouldContinue(entity: LivingEntity): boolean {
    const player = entity.playerPosition;
    if (!player) {
      return false;
    }
    const dx = player.x - entity.position.x;
    const dz = player.z - entity.position.z;
    return dx * dx + dz * dz <= LOSE_RADIUS * LOSE_RADIUS;
  }

  public start(_entity: LivingEntity): void {
    // Head turning is applied each tick; nothing to set up.
  }

  public tick(entity: LivingEntity): void {
    const player = entity.playerPosition;
    if (!player) {
      return;
    }
    const dx = player.x - entity.position.x;
    const dz = player.z - entity.position.z;
    const targetYaw = (Math.atan2(dz, dx) * 180) / Math.PI - 90;
    entity.setHeadLookIntent(targetYaw, 0.2);
  }

  public stop(_entity: LivingEntity): void {
    // Head eases back to normal via idle/wander; nothing to release.
  }
}
