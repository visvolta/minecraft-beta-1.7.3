import { ControlFlags, type AiTask } from '../AiTask';
import type { LivingEntity } from '../../living/LivingEntity';
import { AnimalEntity } from '../../living/AnimalEntity';

const TEMPT_RANGE = 8;

/** Release 1.4.2-style food attraction, adapted to the existing player reference. */
export class TemptTask implements AiTask {
  public readonly priority = 16;
  public readonly controlFlags = ControlFlags.Move | ControlFlags.Look;

  public shouldStart(entity: LivingEntity): boolean {
    return entity instanceof AnimalEntity && this.canFollow(entity);
  }

  public shouldContinue(entity: LivingEntity): boolean {
    return entity instanceof AnimalEntity && this.canFollow(entity);
  }

  public start(entity: LivingEntity): void {
    this.moveTowardPlayer(entity as AnimalEntity);
  }

  public tick(entity: LivingEntity): void {
    const animal = entity as AnimalEntity;
    const player = animal.playerPosition;
    if (player === undefined) return;
    const dx = player.x - animal.position.x;
    const dz = player.z - animal.position.z;
    animal.headYaw = Math.atan2(dz, dx) * 180 / Math.PI - 90;
    if (dx * dx + dz * dz > 2.5 * 2.5 && !animal.navigation.hasPath()) {
      this.moveTowardPlayer(animal);
    } else if (dx * dx + dz * dz <= 2.5 * 2.5) {
      animal.navigation.clearPath();
    }
  }

  public stop(entity: LivingEntity): void {
    entity.navigation.clearPath();
  }

  private canFollow(animal: AnimalEntity): boolean {
    if (!animal.isAlive() || animal.recentlyHurt || !animal.isPlayerHoldingBreedingItem()) return false;
    const player = animal.playerPosition;
    if (player === undefined) return false;
    const dx = player.x - animal.position.x;
    const dy = player.y - animal.position.y;
    const dz = player.z - animal.position.z;
    return dx * dx + dy * dy + dz * dz <= TEMPT_RANGE * TEMPT_RANGE;
  }

  private moveTowardPlayer(animal: AnimalEntity): void {
    const player = animal.playerPosition;
    if (player !== undefined) animal.navigation.moveTo(animal, player);
  }
}
