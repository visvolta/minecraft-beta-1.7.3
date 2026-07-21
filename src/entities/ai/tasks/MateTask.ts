import { ControlFlags, type AiTask } from '../AiTask';
import type { LivingEntity } from '../../living/LivingEntity';
import { AnimalEntity } from '../../living/AnimalEntity';

const PARTNER_RANGE = 8;
const BREED_REACH_SQ = 3.5 * 3.5;
const COURTSHIP_TICKS = 60;

/** Release 1.4.2 mating behavior using bounded, chunk-first partner queries. */
export class MateTask implements AiTask {
  public readonly priority = 18;
  public readonly controlFlags = ControlFlags.Move | ControlFlags.Look;
  private partner: AnimalEntity | null = null;
  private courtshipTicks = 0;

  public shouldStart(entity: LivingEntity): boolean {
    if (!(entity instanceof AnimalEntity) || !entity.isInLove()) return false;
    this.partner = this.findPartner(entity);
    return this.partner !== null;
  }

  public shouldContinue(entity: LivingEntity): boolean {
    return entity instanceof AnimalEntity && entity.isInLove() && this.partner !== null &&
      this.partner.isAlive() && this.partner.isInLove() && this.partner.typeId === entity.typeId &&
      this.courtshipTicks < COURTSHIP_TICKS;
  }

  public start(_entity: LivingEntity): void {
    this.courtshipTicks = 0;
  }

  public tick(entity: LivingEntity): void {
    const animal = entity as AnimalEntity;
    const partner = this.partner;
    if (partner === null) return;
    this.courtshipTicks += 1;
    const dx = partner.position.x - animal.position.x;
    const dz = partner.position.z - animal.position.z;
    animal.setHeadLookIntent(Math.atan2(dz, dx) * 180 / Math.PI - 90);
    if (!animal.navigation.hasPath()) animal.navigation.moveTo(animal, partner.position);
    const dy = partner.position.y - animal.position.y;
    if (this.courtshipTicks >= COURTSHIP_TICKS && dx * dx + dy * dy + dz * dz < BREED_REACH_SQ) {
      animal.breedWith(partner);
      this.courtshipTicks = COURTSHIP_TICKS;
    }
  }

  public stop(entity: LivingEntity): void {
    entity.navigation.clearPath();
    this.partner = null;
    this.courtshipTicks = 0;
  }

  private findPartner(animal: AnimalEntity): AnimalEntity | null {
    const box = animal.getAABB().expand(PARTNER_RANGE, PARTNER_RANGE, PARTNER_RANGE);
    const candidates = animal.entityManager.getEntitiesInAABB(
      box,
      (other): other is AnimalEntity => other instanceof AnimalEntity && other !== animal &&
        other.typeId === animal.typeId && other.isInLove(),
    );
    let nearest: AnimalEntity | null = null;
    let nearestSq = Infinity;
    for (const candidate of candidates) {
      const dx = candidate.position.x - animal.position.x;
      const dy = candidate.position.y - animal.position.y;
      const dz = candidate.position.z - animal.position.z;
      const distanceSq = dx * dx + dy * dy + dz * dz;
      if (distanceSq < nearestSq) {
        nearestSq = distanceSq;
        nearest = candidate;
      }
    }
    return nearest;
  }
}
