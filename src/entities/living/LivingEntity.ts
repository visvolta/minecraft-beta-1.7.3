import { Entity } from '../core/Entity';
import type { EntityTickContext, EntityWorldContext } from '../core/EntityContext';
import { nbt, type NbtCompound, type NbtTag } from '../../persistence/nbt/Nbt';
import { Pathfinder } from '../nav/Pathfinder';
import { Navigation } from '../nav/Navigation';
import { AiController } from '../ai/AiController';

/** Beta living-entity gravity (blocks/tick²), heavier than items (0.04). */
const LIVING_GRAVITY = 0.08;
/** Beta jump impulse. */
const JUMP_VELOCITY = 0.42;
/** Terminal fall speed for living entities. */
const TERMINAL_VELOCITY = -1.5;
/** Fall distance beyond which damage begins (Beta: 3 blocks). */
const FALL_DAMAGE_THRESHOLD = 3;
/** Ticks of invulnerability after being hurt (Beta `heartsLife`). */
const HURT_RESISTANT_TICKS = 20;
/** Ticks the corpse lingers before dropping loot and despawning. */
const DEATH_LINGER_TICKS = 20;

function wrapDegrees(degrees: number): number {
  let d = degrees % 360;
  if (d >= 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/**
 * Base for all living entities (Beta `EntityLiving`).
 *
 * Adds health, damage/invulnerability/hurt/death handling, knockback, fall
 * damage, eye height, heading/body-yaw state and a Beta-style movement
 * integrator on top of the shared {@link Entity}. Owns a {@link Navigation}
 * and an {@link AiController}; concrete mobs configure dimensions, speed, AI
 * tasks and visuals.
 *
 * Note: `stepHeight` defaults to 1.0 so mobs can walk up single blocks without
 * a full jump system (Beta uses 0.5 + jumping; this is a documented Stage-1
 * simplification for the validation mob).
 */
export abstract class LivingEntity extends Entity {
  public health = 10;
  public maxHealth = 10;

  public hurtTime = 0;
  public maxHurtTime = 0;
  public hurtResistantTime = 0;
  public deathTime = 0;
  public attackTime = 0;

  /** Limb-swing animation state (Beta `legYaw`/`legSwing`). */
  public legYaw = 0;
  public prevLegYaw = 0;
  public legSwing = 0;
  /** Body orientation; the head uses `yaw`, the body this (Beta `renderYawOffset`). */
  public renderYawOffset = 0;
  public prevRenderYawOffset = 0;

  /** Movement intent set by AI/navigation. */
  public moveStrafing = 0;
  public moveForward = 0;
  public isJumping = false;
  /** Ground speed in blocks/tick (Beta `moveSpeed`). */
  public moveSpeed = 0.7;

  public readonly navigation: Navigation;
  public readonly aiController: AiController;

  protected constructor(protected readonly ctx: EntityWorldContext) {
    super();
    this.stepHeight = 1.0;
    const pathfinder = new Pathfinder(ctx.blockRegistry, ctx.behaviourRegistry, ctx.blockUpdateWorld);
    this.navigation = new Navigation(pathfinder);
    this.aiController = new AiController();
  }

  public isAlive(): boolean {
    return this.health > 0 && !this.removed;
  }

  /** Beta eye height: 85% of body height. */
  public getEyeHeight(): number {
    return this.height * 0.85;
  }

  /** World-owned RNG draw for AI decisions (Beta mobs use the world RNG). */
  public nextInt(bound: number): number {
    return this.ctx.rng.nextInt(bound);
  }

  /** Wander-destination weight (Beta `EntityCreature` default 0; animals override). */
  public getBlockPathWeight(_x: number, _y: number, _z: number): number {
    return 0;
  }

  // ---- Simulation --------------------------------------------------------

  public onTick(ctx: EntityTickContext): void {
    this.age += 1;

    if (this.health <= 0) {
      this.onDeathTick(ctx);
      return;
    }

    if (this.hurtTime > 0) this.hurtTime -= 1;
    if (this.hurtResistantTime > 0) this.hurtResistantTime -= 1;
    if (this.attackTime > 0) this.attackTime -= 1;

    // AI sets intent; navigation follows any active path; then integrate motion.
    this.aiController.update(this);
    this.navigation.update(this);
    this.moveLiving(ctx, this.moveStrafing, this.moveForward);
    this.isJumping = false;
    this.updateLivingAnimation();
  }

  /** Beta-style land movement: gravity, jump, wish steering, collision, drag. */
  protected moveLiving(ctx: EntityTickContext, strafe: number, forward: number): void {
    this.velocity.y -= LIVING_GRAVITY;
    if (this.velocity.y < TERMINAL_VELOCITY) {
      this.velocity.y = TERMINAL_VELOCITY;
    }
    if (this.isJumping && this.onGround) {
      this.velocity.y = JUMP_VELOCITY;
    }

    const lengthSq = strafe * strafe + forward * forward;
    if (lengthSq >= 1e-4) {
      const length = Math.sqrt(lengthSq);
      const yawRad = (this.yaw * Math.PI) / 180;
      const nx = (strafe * Math.cos(yawRad) - forward * Math.sin(yawRad)) / length;
      const nz = (forward * Math.cos(yawRad) + strafe * Math.sin(yawRad)) / length;
      const targetVx = nx * this.moveSpeed;
      const targetVz = nz * this.moveSpeed;
      if (this.onGround) {
        // Responsive ground control (Beta's snappy ground movement).
        this.velocity.x = targetVx;
        this.velocity.z = targetVz;
      } else {
        // Gentle air influence preserves jump momentum.
        this.velocity.x += (targetVx - this.velocity.x) * 0.1;
        this.velocity.z += (targetVz - this.velocity.z) * 0.1;
      }
    } else if (this.onGround) {
      this.velocity.x *= 0.6;
      this.velocity.z *= 0.6;
    }

    const prevY = this.position.y;
    ctx.world.physics.move(this);
    this.velocity.y *= 0.98;

    // Fall-damage bookkeeping.
    const deltaY = this.position.y - prevY;
    if (this.onGround) {
      if (this.fallDistance > FALL_DAMAGE_THRESHOLD) {
        this.fall(this.fallDistance);
      }
      this.fallDistance = 0;
    } else if (deltaY < 0) {
      this.fallDistance -= deltaY;
    }
  }

  private updateLivingAnimation(): void {
    this.prevLegYaw = this.legYaw;
    this.prevRenderYawOffset = this.renderYawOffset;

    const dx = this.position.x - this.previousPosition.x;
    const dz = this.position.z - this.previousPosition.z;
    let speed = Math.sqrt(dx * dx + dz * dz) * 4;
    if (speed > 1) speed = 1;
    this.legSwing += (speed - this.legSwing) * 0.4;
    this.legYaw += this.legSwing;

    // Body eases toward the head/heading direction.
    const yawDiff = wrapDegrees(this.yaw - this.renderYawOffset);
    this.renderYawOffset += yawDiff * 0.3;
  }

  // ---- Damage / death ----------------------------------------------------

  /** Applies damage respecting the invulnerability window. Returns true if hurt. */
  public attackEntityFrom(amount: number): boolean {
    if (this.health <= 0) {
      return false;
    }
    if (this.hurtResistantTime > 0) {
      return false;
    }
    this.health -= amount;
    this.hurtTime = 10;
    this.maxHurtTime = 10;
    this.hurtResistantTime = HURT_RESISTANT_TICKS;
    this.onHurtSound();
    if (this.health <= 0) {
      this.health = 0;
      this.onDeathSound();
    }
    return true;
  }

  public heal(amount: number): void {
    if (this.health <= 0) {
      return;
    }
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  /** Beta knockback: horizontal push away from (dirX, dirZ) plus an upward pop. */
  public knockBack(dirX: number, dirZ: number, strength = 0.4): void {
    const length = Math.hypot(dirX, dirZ);
    if (length < 1e-6) {
      return;
    }
    const nx = dirX / length;
    const nz = dirZ / length;
    this.velocity.x = this.velocity.x * 0.5 - nx * strength;
    this.velocity.z = this.velocity.z * 0.5 - nz * strength;
    this.velocity.y = 0.4;
  }

  /** Applies fall damage for the given fall distance (Beta: distance − 3). */
  protected fall(distance: number): void {
    const damage = Math.floor(distance) - FALL_DAMAGE_THRESHOLD;
    if (damage > 0) {
      this.attackEntityFrom(damage);
    }
  }

  private onDeathTick(ctx: EntityTickContext): void {
    this.deathTime += 1;
    if (this.deathTime === DEATH_LINGER_TICKS) {
      this.dropLoot(ctx);
      this.markRemoved();
    }
  }

  // ---- Hooks for subclasses ---------------------------------------------

  /** Drops loot on death. Default: nothing. */
  protected dropLoot(_ctx: EntityTickContext): void {
    // Subclasses override.
  }

  protected onHurtSound(): void {
    // Sound hook; no audio system in Stage 1.
  }

  protected onDeathSound(): void {
    // Sound hook; no audio system in Stage 1.
  }

  protected onLivingSound(): void {
    // Sound hook; no audio system in Stage 1.
  }

  // ---- Serialisation (type-specific shared living fields) ----------------

  protected writeLivingNbt(map: Map<string, NbtTag>): void {
    map.set('Health', nbt.short(this.health));
    map.set('HurtTime', nbt.short(this.hurtTime));
    map.set('DeathTime', nbt.short(this.deathTime));
  }

  protected readLivingNbt(data: NbtCompound): void {
    const map = data.value;
    const health = map.get('Health');
    if (health?.type === 'short' || health?.type === 'int') {
      this.health = health.value;
    }
    const hurtTime = map.get('HurtTime');
    if (hurtTime?.type === 'short' || hurtTime?.type === 'int') {
      this.hurtTime = hurtTime.value;
    }
    const deathTime = map.get('DeathTime');
    if (deathTime?.type === 'short' || deathTime?.type === 'int') {
      this.deathTime = deathTime.value;
    }
  }
}
