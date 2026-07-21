import { ControlFlags, type AiTask } from '../AiTask';
import type { LivingEntity } from '../../living/LivingEntity';
import { SkeletonEntity } from '../../hostile/SkeletonEntity';

export class SkeletonRangedAttackTask implements AiTask {
  public readonly priority = 18;
  public readonly controlFlags = ControlFlags.Move | ControlFlags.Look;
  public shouldStart(entity: LivingEntity): boolean { return entity instanceof SkeletonEntity && entity.attackTime <= 0 && entity.canShootTarget(); }
  public shouldContinue(): boolean { return false; }
  public start(entity: LivingEntity): void { (entity as SkeletonEntity).shootTarget(); }
  public tick(): void {}
  public stop(): void {}
}
