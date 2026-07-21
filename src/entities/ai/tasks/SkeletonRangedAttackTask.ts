import { ControlFlags, type AiTask } from '../AiTask';
import type { LivingEntity } from '../../living/LivingEntity';
import { SkeletonEntity } from '../../hostile/SkeletonEntity';
export class SkeletonRangedAttackTask implements AiTask{
 public readonly priority=18;public readonly controlFlags=ControlFlags.Move|ControlFlags.Look;
 public shouldStart(entity:LivingEntity):boolean{return entity instanceof SkeletonEntity&&entity.attackTime<=0&&entity.canShootTarget();}
 public shouldContinue(entity:LivingEntity):boolean{return entity instanceof SkeletonEntity&&entity.rangedDrawTicks>0&&entity.canShootTarget();}
 public start(entity:LivingEntity):void{(entity as SkeletonEntity).beginRangedDraw();}
 public tick(entity:LivingEntity):void{(entity as SkeletonEntity).tickRangedDraw();}
 public stop(entity:LivingEntity):void{(entity as SkeletonEntity).cancelRangedDraw();}
}
