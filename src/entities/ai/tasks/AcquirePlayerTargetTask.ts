import { ControlFlags, type AiTask } from '../AiTask';
import type { LivingEntity } from '../../living/LivingEntity';
import { HostileEntity } from '../../hostile/HostileEntity';

/** Transient direct single-player acquisition; no player/world scan. */
export class AcquirePlayerTargetTask implements AiTask {
  public readonly priority = 19;
  public readonly controlFlags = ControlFlags.None;

  public shouldStart(entity: LivingEntity): boolean {
    return entity instanceof HostileEntity && entity.target === null;
  }
  public shouldContinue(entity: LivingEntity): boolean {
    return entity instanceof HostileEntity && entity.target !== null;
  }
  public start(entity: LivingEntity): void { (entity as HostileEntity).acquirePlayerTarget(); }
  public tick(entity: LivingEntity): void { (entity as HostileEntity).validateTarget(false); }
  public stop(_entity: LivingEntity): void {}
}
