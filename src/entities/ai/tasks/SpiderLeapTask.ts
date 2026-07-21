import { ControlFlags, type AiTask } from '../AiTask';
import type { LivingEntity } from '../../living/LivingEntity';
import { SpiderEntity } from '../../hostile/SpiderEntity';
export class SpiderLeapTask implements AiTask {
  public readonly priority = 18;
  public readonly controlFlags = ControlFlags.Move | ControlFlags.Look | ControlFlags.Jump;
  public shouldStart(entity: LivingEntity): boolean { return entity instanceof SpiderEntity && entity.canLeapAtTarget(); }
  public shouldContinue(): boolean { return false; }
  public start(entity: LivingEntity): void { (entity as SpiderEntity).leapAtTarget(); }
  public tick(): void {} public stop(): void {}
}
