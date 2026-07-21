import { ControlFlags, type AiTask } from '../AiTask';
import type { LivingEntity } from '../../living/LivingEntity';
import { HostileEntity } from '../../hostile/HostileEntity';

/** Shared Beta EntityMob melee gate and exactly-once damage application. */
export class MeleeAttackTask implements AiTask {
  public readonly priority = 18;
  public readonly controlFlags = ControlFlags.Move | ControlFlags.Look;

  public shouldStart(entity: LivingEntity): boolean {
    return entity instanceof HostileEntity && entity.attackTime <= 0 && entity.canSeeTarget() && this.inReach(entity);
  }
  public shouldContinue(_entity: LivingEntity): boolean { return false; }
  public start(entity: LivingEntity): void {
    const hostile = entity as HostileEntity;
    const player = hostile.target;
    if (hostile.attackTime > 0 || player === null || !hostile.validateTarget(false) || !hostile.canSeeTarget() || !this.inReach(hostile)) return;
    const dx=player.position.x-hostile.position.x,dz=player.position.z-hostile.position.z;
    hostile.setHeadLookIntent(Math.atan2(dz,dx)*180/Math.PI-90);
    hostile.attackTime = hostile.meleeCooldownTicks;
    player.attackFromMob(hostile.getMeleeDamage(), hostile);
  }
  public tick(_entity: LivingEntity): void {}
  public stop(_entity: LivingEntity): void {}

  private inReach(hostile: HostileEntity): boolean {
    const player = hostile.target;
    if (player === null || !player.isAlive()) return false;
    const dx = player.position.x - hostile.position.x;
    const dz = player.position.z - hostile.position.z;
    const hostileBox = hostile.getAABB();
    const playerBox = player.getAABB();
    return dx * dx + dz * dz < hostile.meleeReach * hostile.meleeReach &&
      playerBox.maxY > hostileBox.minY && playerBox.minY < hostileBox.maxY;
  }
}
