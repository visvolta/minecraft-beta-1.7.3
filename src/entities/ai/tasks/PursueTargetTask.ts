import { ControlFlags, type AiTask } from '../AiTask';
import type { LivingEntity } from '../../living/LivingEntity';
import { HostileEntity } from '../../hostile/HostileEntity';

export class PursueTargetTask implements AiTask {
  public readonly priority = 17;
  public readonly controlFlags = ControlFlags.Move | ControlFlags.Look;
  private repathTicks = 0;

  public shouldStart(entity: LivingEntity): boolean {
    return entity instanceof HostileEntity && entity.validateTarget(false);
  }
  public shouldContinue(entity: LivingEntity): boolean {
    return entity instanceof HostileEntity && entity.validateTarget(false);
  }
  public start(entity: LivingEntity): void {
    this.repathTicks = 0;
    this.repath(entity as HostileEntity);
  }
  public tick(entity: LivingEntity): void {
    const hostile = entity as HostileEntity;
    if (hostile.target) {
      const dx=hostile.target.position.x-hostile.position.x, dz=hostile.target.position.z-hostile.position.z;
      hostile.setHeadLookIntent(Math.atan2(dz,dx)*180/Math.PI-90,0.2);
    }
    if (--this.repathTicks <= 0 || !hostile.navigation.hasPath()) this.repath(hostile);
  }
  public stop(entity: LivingEntity): void {
    entity.navigation.clearPath();
    this.repathTicks = 0;
  }
  private repath(hostile: HostileEntity): void {
    if (hostile.target !== null) hostile.navigation.moveTo(hostile, hostile.target.position);
    this.repathTicks = hostile.repathIntervalTicks;
  }
}
