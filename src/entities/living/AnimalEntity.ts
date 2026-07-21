import { LivingEntity } from './LivingEntity';
import { BlockIds } from '../../blocks/BlockId';
import type { EntityTickContext } from '../core/EntityContext';
import { nbt, type NbtCompound, type NbtTag } from '../../persistence/nbt/Nbt';
import { MateTask } from '../ai/tasks/MateTask';
import { TemptTask } from '../ai/tasks/TemptTask';

export const ANIMAL_LOVE_TICKS = 600;
export const ANIMAL_BREEDING_COOLDOWN_TICKS = 6000;
export const ANIMAL_CHILD_GROWTH_TICKS = 24000;
export const BABY_SCALE = 0.5;

/** Shared passive-animal state based on Release 1.4.2 EntityAnimal/EntityAgeable. */
export abstract class AnimalEntity extends LivingEntity {
  public growingAge = 0;
  public loveTicks = 0;
  private adultWidth = 0;
  private adultHeight = 0;

  public override get isPassiveCreature(): boolean {
    return true;
  }

  public abstract get breedingItemId(): string;
  protected abstract createChild(x: number, y: number, z: number): AnimalEntity;

  protected initializeAnimal(width: number, height: number): void {
    this.adultWidth = width;
    this.adultHeight = height;
    this.applyAgeDimensions();
    this.aiController.addTask(new MateTask());
    this.aiController.addTask(new TemptTask());
  }

  public override onTick(ctx: EntityTickContext): void {
    if (this.growingAge < 0) this.setGrowingAge(this.growingAge + 1);
    else if (this.growingAge > 0) this.growingAge -= 1;
    if (this.loveTicks > 0) this.loveTicks -= 1;
    super.onTick(ctx);
  }

  public isChild(): boolean {
    return this.growingAge < 0;
  }

  public isInLove(): boolean {
    return this.loveTicks > 0 && this.growingAge === 0 && this.isAlive();
  }

  public canEnterLoveMode(): boolean {
    return this.growingAge === 0 && this.loveTicks === 0 && this.isAlive();
  }

  public setGrowingAge(age: number): void {
    const wasChild = this.isChild();
    this.growingAge = age;
    if (wasChild !== this.isChild()) this.applyAgeDimensions();
  }

  public enterLoveMode(): boolean {
    if (!this.canEnterLoveMode()) return false;
    this.loveTicks = ANIMAL_LOVE_TICKS;
    return true;
  }

  /** Release 1.4.2-style baby feeding: remove 10% of remaining growth time. */
  public accelerateGrowth(): boolean {
    if (!this.isChild()) return false;
    const step = Math.max(1, Math.floor(-this.growingAge * 0.1));
    this.setGrowingAge(Math.min(0, this.growingAge + step));
    return true;
  }

  public isPlayerHoldingBreedingItem(): boolean {
    return this.ctx.playerHeldItemId?.() === this.breedingItemId;
  }

  public breedWith(partner: AnimalEntity): boolean {
    if (partner === this || partner.typeId !== this.typeId || !this.isInLove() || !partner.isInLove()) return false;
    // Apply durable parent state before queuing the child, preventing the
    // partner's task later in the same manager tick from creating a duplicate.
    this.loveTicks = 0;
    partner.loveTicks = 0;
    this.setGrowingAge(ANIMAL_BREEDING_COOLDOWN_TICKS);
    partner.setGrowingAge(ANIMAL_BREEDING_COOLDOWN_TICKS);
    const child = this.createChild(
      (this.position.x + partner.position.x) * 0.5,
      Math.min(this.position.y, partner.position.y),
      (this.position.z + partner.position.z) * 0.5,
    );
    child.setGrowingAge(-ANIMAL_CHILD_GROWTH_TICKS);
    this.entityManager.add(child);
    return true;
  }

  /** Rendering subclasses apply reversible model-root scaling only. */
  protected applyBabyVisualScale(_scale: number): void {
    // Headless/default animal has no model surface.
  }

  public getBlockPathWeight(x: number, y: number, z: number): number {
    const below = this.ctx.blockUpdateWorld.getBlock(x, y - 1, z);
    return below === BlockIds.Grass ? 10 : 0;
  }

  protected shouldDropLoot(): boolean {
    return !this.isChild();
  }

  protected writeAnimalNbt(map: Map<string, NbtTag>): void {
    this.writeLivingNbt(map);
    map.set('GrowingAge', nbt.int(this.growingAge));
    map.set('InLove', nbt.int(this.loveTicks));
  }

  protected readAnimalNbt(data: NbtCompound): void {
    this.readLivingNbt(data);
    const age = data.value.get('GrowingAge');
    if (age?.type === 'int' || age?.type === 'short') this.setGrowingAge(age.value);
    const love = data.value.get('InLove');
    if (love?.type === 'int' || love?.type === 'short') this.loveTicks = Math.max(0, love.value);
  }

  private applyAgeDimensions(): void {
    if (this.adultWidth <= 0 || this.adultHeight <= 0) return;
    const scale = this.isChild() ? BABY_SCALE : 1;
    this.setSize(this.adultWidth * scale, this.adultHeight * scale);
    this.applyBabyVisualScale(scale);
  }
}
