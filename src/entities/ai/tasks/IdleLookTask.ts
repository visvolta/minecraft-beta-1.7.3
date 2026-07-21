import type { AiTask } from '../AiTask';
import { ControlFlags } from '../AiTask.ts';
import type { LivingEntity } from '../../living/LivingEntity';


/**
 * Idle head-turning (Beta mobs occasionally glance around when not moving).
 * Low priority and only claims the Look channel, so it yields to wandering.
 */
export class IdleLookTask implements AiTask {
  public readonly priority = 5;
  public readonly controlFlags = ControlFlags.Look;

  private lookTicks = 0;
  private targetYaw = 0;

  public shouldStart(entity: LivingEntity): boolean {
    return !entity.navigation.hasPath();
  }

  public shouldContinue(entity: LivingEntity): boolean {
    return !entity.navigation.hasPath();
  }

  public start(entity: LivingEntity): void {
    this.pickNewLook(entity);
  }

  public tick(entity: LivingEntity): void {
    if (this.lookTicks <= 0) {
      this.pickNewLook(entity);
    }
    this.lookTicks -= 1;
    // Turn the head only; the body keeps facing the movement heading.
    entity.setHeadLookIntent(this.targetYaw, 0.2);
  }

  public stop(_entity: LivingEntity): void {
    // Nothing to release.
  }

  private pickNewLook(entity: LivingEntity): void {
    this.targetYaw = entity.headYaw + (entity.nextInt(60) - 30);
    this.lookTicks = 20 + entity.nextInt(20);
  }
}
