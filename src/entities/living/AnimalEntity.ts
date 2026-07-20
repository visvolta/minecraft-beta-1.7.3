import { LivingEntity } from './LivingEntity';
import { BlockIds } from '../../blocks/BlockId';

/**
 * Base for passive animals (Beta `EntityAnimal`).
 *
 * Stage 1 keeps only what the validation mob needs: grass-weighted wander
 * destination selection. Natural spawning, breeding and despawn-by-distance
 * are deferred to a later stage (no natural spawning in Stage 1).
 */
export abstract class AnimalEntity extends LivingEntity {
  /**
   * Beta `getBlockPathWeight`: strongly prefer cells with grass beneath them
   * when choosing where to wander; otherwise neutral.
   */
  public getBlockPathWeight(x: number, y: number, z: number): number {
    const below = this.ctx.blockUpdateWorld.getBlock(x, y - 1, z);
    return below === BlockIds.Grass ? 10 : 0;
  }
}
