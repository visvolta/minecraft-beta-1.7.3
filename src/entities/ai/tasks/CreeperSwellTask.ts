import { ControlFlags, type AiTask } from '../AiTask';
import type { LivingEntity } from '../../living/LivingEntity';
import { CreeperEntity } from '../../hostile/CreeperEntity';
export class CreeperSwellTask implements AiTask {
  public readonly priority = 18;
  public readonly controlFlags = ControlFlags.Move | ControlFlags.Look;
  public shouldStart(entity: LivingEntity): boolean { return entity instanceof CreeperEntity && entity.shouldSwell(); }
  public shouldContinue(entity: LivingEntity): boolean { return entity instanceof CreeperEntity && (entity.fuseTicks > 0 || entity.shouldSwell()); }
  public start(): void {}
  public tick(entity: LivingEntity): void { (entity as CreeperEntity).updateFuse(); }
  public stop(entity: LivingEntity): void { (entity as CreeperEntity).defuse(); }
}
