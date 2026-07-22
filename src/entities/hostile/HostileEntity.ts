import { nbt, type NbtCompound, type NbtTag } from '../../persistence/nbt/Nbt';
import type { Player } from '../../player/Player';
import { Difficulty } from '../../world/Difficulty';
import { hasLineOfSight } from '../../world/LineOfSight';
import type { EntityTickContext, EntityWorldContext } from '../core/EntityContext';
import { AcquirePlayerTargetTask } from '../ai/tasks/AcquirePlayerTargetTask';
import { MeleeAttackTask } from '../ai/tasks/MeleeAttackTask';
import { PursueTargetTask } from '../ai/tasks/PursueTargetTask';
import { WanderTask } from '../ai/tasks/WanderTask';
import { LivingEntity } from '../living/LivingEntity';
import { evaluateHostileDaylight, type HostileDaylightExposure } from './HostileDaylight';

export abstract class HostileEntity extends LivingEntity {
  public override get isHostileMob(): boolean { return true; }

  public target: Player | null = null;
  public persistenceRequired = false;

  public readonly detectionRange = 16;
  public readonly meleeReach = 2;
  public readonly meleeCooldownTicks = 20;
  public readonly repathIntervalTicks = 20;
  public abstract readonly meleeDamage: number;

  protected constructor(
    ctx: EntityWorldContext,
    options: { readonly melee?: boolean; readonly pursuit?: boolean; readonly wander?: boolean } = {},
  ) {
    super(ctx);
    this.maxHealth = 20;
    this.health = 20;
    if (options.melee ?? true) this.aiController.addTask(new MeleeAttackTask());
    this.aiController.addTask(new AcquirePlayerTargetTask());
    if (options.pursuit ?? true) this.aiController.addTask(new PursueTargetTask());
    if (options.wander ?? true) this.aiController.addTask(new WanderTask());
  }

  public override onTick(ctx: EntityTickContext): void {
    if ((this.ctx.difficulty?.() ?? Difficulty.Normal) === Difficulty.Peaceful) {
      this.markRemoved();
      return;
    }
    const daylight = this.getDaylightExposure();
    if (daylight.brightness > 0.5) this.age += 2;
    super.onTick(ctx);
    if (!this.removed) this.updateDespawn();
  }

  /** Difficulty-owned extension point; Beta base damage remains unchanged here. */
  public getMeleeDamage(): number {
    return this.meleeDamage;
  }

  public acquirePlayerTarget(): Player | null {
    const player = this.ctx.player;
    if (player === undefined || !this.isValidTarget(player, true)) return null;
    this.target = player;
    return player;
  }

  public validateTarget(requireVisibility = false): boolean {
    if (this.target === null || !this.isValidTarget(this.target, requireVisibility)) {
      this.clearTarget();
      return false;
    }
    return true;
  }

  public canSeeTarget(): boolean {
    const player = this.target;
    if (player === null) return false;
    return hasLineOfSight(
      this.ctx.blockUpdateWorld,
      this.ctx.blockRegistry,
      { x: this.position.x, y: this.position.y + this.getEyeHeight(), z: this.position.z },
      { x: player.position.x, y: player.getEyeY(), z: player.position.z },
    );
  }

  public clearTarget(): void {
    this.target = null;
    this.navigation.clearPath();
  }

  public getDaylightExposure(): HostileDaylightExposure {
    return evaluateHostileDaylight(this, this.ctx);
  }

  public setPersistenceRequired(required = true): void {
    this.persistenceRequired = required;
  }

  protected writeHostileNbt(map: Map<string, NbtTag>): void {
    this.writeLivingNbt(map);
    map.set('PersistenceRequired', nbt.byte(this.persistenceRequired ? 1 : 0));
  }

  protected readHostileNbt(data: NbtCompound): void {
    this.readLivingNbt(data);
    const tag = data.value.get('PersistenceRequired');
    if (tag?.type === 'byte' || tag?.type === 'int') this.persistenceRequired = tag.value !== 0;
    this.target = null;
    this.attackTime = 0;
    this.navigation.clearPath();
  }

  private isValidTarget(player: Player, requireVisibility: boolean): boolean {
    if (!player.isAlive() || player.isCreativeMode() || !this.ctx.blockUpdateWorld.isLoaded(player.position.x, player.position.z)) return false;
    const dx = player.position.x - this.position.x;
    const dy = player.position.y - this.position.y;
    const dz = player.position.z - this.position.z;
    if (dx * dx + dy * dy + dz * dz > this.detectionRange * this.detectionRange) return false;
    return !requireVisibility || hasLineOfSight(
      this.ctx.blockUpdateWorld,
      this.ctx.blockRegistry,
      { x: this.position.x, y: this.position.y + this.getEyeHeight(), z: this.position.z },
      { x: player.position.x, y: player.getEyeY(), z: player.position.z },
    );
  }

  private updateDespawn(): void {
    if (this.persistenceRequired) return;
    const player = this.ctx.player;
    if (player === undefined) return;
    const dx = player.position.x - this.position.x;
    const dy = player.position.y - this.position.y;
    const dz = player.position.z - this.position.z;
    const distanceSq = dx * dx + dy * dy + dz * dz;
    if (distanceSq > 128 * 128) {
      this.markRemoved();
      return;
    }
    if (this.age > 600 && this.nextInt(800) === 0) {
      if (distanceSq < 32 * 32) this.age = 0;
      else this.markRemoved();
    }
  }
}
