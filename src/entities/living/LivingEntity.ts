import { Entity } from '../core/Entity';
import type { EntityTickContext, EntityWorldContext } from '../core/EntityContext';
import { nbt, type NbtCompound, type NbtTag } from '../../persistence/nbt/Nbt';
import { Pathfinder } from '../nav/Pathfinder';
import { Navigation } from '../nav/Navigation';
import { AiController } from '../ai/AiController';
import { BlockIds } from '../../blocks/BlockId';
import { DamageSource } from '../damage/DamageSource';
import type { ParticleOrigin } from '../particles/EntityParticleSink';
import { DroppedItemEntity } from '../items/DroppedItemEntity';
import type { Drop } from '../items/BlockDropResolver';
import { VOID_MIN_Y } from '../../world/chunkConstants';
import {
  isWaterInAABB,
  isLavaInAABB,
  isFireInAABB,
  isEyeInWater,
  isInsideOpaqueBlock,
  isExposedToSky,
} from './HazardDetection';

/** Beta living-entity gravity (blocks/tick²), heavier than items (0.04). */
const LIVING_GRAVITY = 0.08;
/** Beta jump impulse. */
const JUMP_VELOCITY = 0.42;
/** Terminal fall speed for living entities. */
const TERMINAL_VELOCITY = -1.5;
/** Fall distance beyond which damage begins (Beta: 3 blocks). */
const FALL_DAMAGE_THRESHOLD = 3;
/** Ticks of invulnerability after a full hit (Beta `heartsLife` = 20). */
const HURT_RESISTANT_TICKS = 20;
/** Hurt/hurt-resist duration shown by the hurt animation (Beta hurtTime = 10). */
const MAX_HURT_TIME = 10;
/** Ticks the corpse lingers (death animation) before removal. */
const DEATH_LINGER_TICKS = 20;

// Beta `moveEntityWithHeading` land-movement constants.
const AIR_FRICTION = 0.91;
const MOVE_FLYING_NUMERATOR = 0.16277136;
const AIR_MOVE_FACTOR = 0.02;
const DEFAULT_SLIPPERINESS = 0.6;
const ICE_SLIPPERINESS = 0.98;
/** Maximum degrees the body may turn toward the heading per tick (smooth turn). */
const MAX_BODY_TURN_PER_TICK = 10;

// ---- Environmental hazard constants (Beta) ----
/** Fire damage interval: burn damage lands every N ticks while burning. */
const FIRE_DAMAGE_INTERVAL = 20;
/** Damage per fire tick. */
const FIRE_DAMAGE = 1;
/** Burning duration set by standing in fire (ticks). */
const FIRE_CONTACT_TICKS = 120;
/** Immediate lava contact damage (Beta `setOnFireFromLava` = 4). */
const LAVA_DAMAGE = 4;
/** Burning duration set by lava (ticks; Beta = 600). */
const LAVA_FIRE_TICKS = 600;
/** Maximum air supply (ticks; Beta = 300 ≈ 15s). */
const MAX_AIR = 300;
/** Drowning damage when air underflows (Beta = 2). */
const DROWN_DAMAGE = 2;
/** Suffocation damage per tick inside an opaque block (Beta = 1). */
const SUFFOCATE_DAMAGE = 1;
/** Repeated void damage per tick below the world minimum (bypasses invuln). */
const VOID_DAMAGE = 4;
/** Swim acceleration factor in water/lava (Beta moveFlying 0.02). */
const SWIM_MOVE_FACTOR = 0.02;
/** Reduced gravity while in a fluid (Beta 0.02). */
const FLUID_GRAVITY = 0.02;
/** Upward swim impulse per tick while jump/swim intent is held in a fluid. */
const SWIM_UP_IMPULSE = 0.1;

function wrapDegrees(degrees: number): number {
  let d = degrees % 360;
  if (d >= 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/**
 * Base for all living entities (Beta `EntityLiving`).
 *
 * Owns health and the shared damage/death state. All damage — player melee,
 * mob attacks, and environmental (fall/fire/lava/drown/suffocation/void) —
 * routes through {@link attackEntityFrom} with a {@link DamageSource}, giving a
 * single consistent flow: invulnerability frames with Beta repeated-hit
 * protection, hurt timers, recoil, directional knockback (through velocity +
 * the shared physics), hurt/death particle hooks, and a delayed, exactly-once
 * death (loot + cleanup).
 *
 * Combat state other than health and the minimal death timer is transient and
 * is not restored after save/load (see serialisation below).
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
  /** Body orientation; eases smoothly toward the heading (Beta `renderYawOffset`). */
  public renderYawOffset = 0;
  public prevRenderYawOffset = 0;
  /** Head orientation; independent of the body (idle-looking turns this). */
  public headYaw = 0;
  public prevHeadYaw = 0;
  /** Recoil angle from the last hit (transient; drives the hurt flinch). */
  public attackedAtYaw = 0;

  /** Movement intent set by AI/navigation. */
  public moveStrafing = 0;
  public moveForward = 0;
  public isJumping = false;
  /** Ground speed in blocks/tick (Beta `moveSpeed`). */
  public moveSpeed = 0.7;

  // ---- Transient combat state (not persisted) ----
  /** The source of the most recent damage (cleared on load). */
  public lastDamageSource: DamageSource | undefined;
  /** Position of the last attacker, for panic flee direction (cleared on load). */
  public lastAttackerPosition: { x: number; z: number } | undefined;
  /** Set when a full hit lands; consumed by the panic AI task. */
  public recentlyHurt = false;
  /** Guards exactly-once loot within a session. */
  protected lootDropped = false;
  /** Beta repeated-hit protection: the last raw damage amount seen. */
  private lastDamageAmount = 0;

  // ---- Environmental state ----
  /** Remaining burn timer in ticks (>0 = burning). Persisted. */
  public fire = 0;
  /** Current air supply in ticks. Persisted. */
  public air = MAX_AIR;
  /** Maximum air supply. */
  public readonly maxAir = MAX_AIR;
  /** Whether the body is currently in water (transient; recomputed each tick). */
  public inWater = false;
  /** Whether the body is currently in lava (transient; recomputed each tick). */
  public inLava = false;

  public readonly navigation: Navigation;
  public readonly aiController: AiController;

  protected constructor(protected readonly ctx: EntityWorldContext) {
    super();
    this.stepHeight = 0.5;
    const pathfinder = new Pathfinder(ctx.blockRegistry, ctx.behaviourRegistry, ctx.blockUpdateWorld);
    this.navigation = new Navigation(pathfinder);
    this.aiController = new AiController();
  }

  /** Living entities can be pushed (Beta `canBePushed`). */
  public override canBePushed(): boolean {
    return true;
  }

  /** Living entities can be targeted/attacked while alive (Beta `canBeCollidedWith`). */
  public override canBeCollidedWith(): boolean {
    return this.isAlive();
  }

  public isAlive(): boolean {
    return this.health > 0 && !this.removed;
  }

  public isDead(): boolean {
    return this.health <= 0;
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
      this.onDeathTick();
      return;
    }

    if (this.hurtTime > 0) this.hurtTime -= 1;
    if (this.hurtResistantTime > 0) this.hurtResistantTime -= 1;
    if (this.attackTime > 0) this.attackTime -= 1;

    // Detect environment first (water/lava/fire contact, ignition, rain/water
    // extinguishing) so movement can branch on inWater/inLava.
    this.detectEnvironment(ctx);

    // AI sets intent (including hazard panic/swim intent); navigation follows;
    // then integrate motion.
    this.aiController.update(this);
    this.navigation.update(this);
    this.moveLiving(ctx, this.moveStrafing, this.moveForward);
    this.isJumping = false;

    // Apply environmental damage (burning, lava, suffocation, drowning, void).
    this.applyEnvironmentDamage(ctx);

    this.updateLivingAnimation();
  }

  /**
   * Movement dispatch (Beta `moveEntityWithHeading`): branches on the current
   * medium. Water/lava use a buoyant, high-drag swim model; land uses the
   * slipperiness-based walk model. The shared `moveFlying` + physics mover are
   * reused throughout (no separate movement architecture).
   */
  protected moveLiving(ctx: EntityTickContext, strafe: number, forward: number): void {
    if (this.inWater) {
      this.moveInFluid(ctx, strafe, forward, 0.8);
    } else if (this.inLava) {
      this.moveInFluid(ctx, strafe, forward, 0.5);
    } else {
      this.moveOnLand(ctx, strafe, forward);
    }
  }

  /**
   * Beta fluid movement: slow `moveFlying` swim acceleration, reduced gravity,
   * high drag, and buoyancy when blocked horizontally. Jump/swim intent (set by
   * the AI, never auto-set here) adds an upward impulse so a mob can surface.
   */
  private moveInFluid(ctx: EntityTickContext, strafe: number, forward: number, drag: number): void {
    this.moveFlying(strafe * this.moveSpeed, forward * this.moveSpeed, SWIM_MOVE_FACTOR);
    if (this.isJumping) {
      this.velocity.y += SWIM_UP_IMPULSE;
    }
    this.velocity.y -= FLUID_GRAVITY;

    ctx.world.physics.move(this);

    // Buoyancy: rise when pressed against a wall underwater (Beta).
    if (this.isCollidedHorizontally) {
      this.velocity.y = Math.max(this.velocity.y, 0.3);
    }

    this.velocity.x *= drag;
    this.velocity.y *= drag;
    this.velocity.z *= drag;
    this.fallDistance = 0; // no fall damage in a fluid
  }

  /**
   * Beta-style land movement (`moveEntityWithHeading`, land branch): a
   * slipperiness-based friction plus `moveFlying` acceleration produces gradual
   * start/stop and a Beta-like terminal walk speed. Gravity, jump and
   * fall-damage bookkeeping retained.
   */
  private moveOnLand(ctx: EntityTickContext, strafe: number, forward: number): void {
    this.velocity.y -= LIVING_GRAVITY;
    if (this.velocity.y < TERMINAL_VELOCITY) {
      this.velocity.y = TERMINAL_VELOCITY;
    }
    if (this.isJumping && this.onGround) {
      this.velocity.y = JUMP_VELOCITY;
    }

    let slipperiness = DEFAULT_SLIPPERINESS;
    if (this.onGround) {
      const belowId = ctx.world.blockUpdateWorld.getBlock(
        Math.floor(this.position.x),
        Math.floor(this.position.y - 0.1),
        Math.floor(this.position.z),
      );
      if (belowId === BlockIds.Ice) {
        slipperiness = ICE_SLIPPERINESS;
      }
    }
    const friction = this.onGround ? slipperiness * 0.91 : AIR_FRICTION;
    const moveFactor = this.onGround
      ? 0.1 * (MOVE_FLYING_NUMERATOR / (friction * friction * friction))
      : AIR_MOVE_FACTOR;

    this.moveFlying(strafe * this.moveSpeed, forward * this.moveSpeed, moveFactor);

    const prevY = this.position.y;
    ctx.world.physics.move(this);

    this.velocity.y *= 0.98;
    this.velocity.x *= friction;
    this.velocity.z *= friction;

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

  private moveFlying(strafe: number, forward: number, factor: number): void {
    const lengthSq = strafe * strafe + forward * forward;
    if (lengthSq < 1e-4) {
      return;
    }
    let length = Math.sqrt(lengthSq);
    if (length < 1.0) {
      length = 1.0;
    }
    const norm = factor / length;
    const s = strafe * norm;
    const f = forward * norm;
    const yawRad = (this.yaw * Math.PI) / 180;
    const sin = Math.sin(yawRad);
    const cos = Math.cos(yawRad);
    this.velocity.x += s * cos - f * sin;
    this.velocity.z += f * cos + s * sin;
  }

  // ---- Environmental hazards (shared) ------------------------------------

  /** Refreshes the burn timer: `fire = max(current, new)` (Beta; never adds). */
  public setOnFire(ticks: number): void {
    this.fire = Math.max(this.fire, ticks);
  }

  /** Immediately stops burning. */
  public extinguish(): void {
    this.fire = 0;
  }

  public isBurning(): boolean {
    return this.fire > 0;
  }

  /** Whether the breathing point (eye) is submerged in water. */
  public isUnderwater(): boolean {
    const eyeY = this.position.y + this.getEyeHeight();
    return isEyeInWater(this.ctx.blockUpdateWorld, this.position.x, eyeY, this.position.z);
  }

  /** Whether the entity can breathe right now (eye not submerged). */
  public canBreathe(): boolean {
    return !this.isUnderwater();
  }

  /**
   * Detects the current medium and handles contact ignition/extinguishing.
   * Runs before movement so `inWater`/`inLava` are available to it. Detection
   * is delegated to the stateless {@link HazardDetection} helpers; all timers
   * and state are owned here.
   */
  protected detectEnvironment(ctx: EntityTickContext): void {
    const world = ctx.world.blockUpdateWorld;
    const aabb = this.getAABB();

    const wasInWater = this.inWater;
    this.inWater = isWaterInAABB(world, aabb);
    this.inLava = isLavaInAABB(world, aabb);

    if (this.inWater) {
      if (!wasInWater) {
        this.onEnterWater();
      }
      this.fallDistance = 0;
      this.extinguish(); // water extinguishes fire
    } else if (wasInWater) {
      this.onLeaveWater();
    }

    // Lava ignites immediately (contact damage is applied in applyEnvironmentDamage).
    if (this.inLava) {
      this.onEnterLava();
      this.setOnFire(LAVA_FIRE_TICKS);
    } else if (isFireInAABB(world, aabb)) {
      // Standing in a fire block ignites (shorter duration than lava).
      this.onEnterFire();
      this.setOnFire(FIRE_CONTACT_TICKS);
    }

    // Rain extinguishes burning when exposed to the sky.
    if (this.fire > 0 && ctx.world.weather?.isRaining()) {
      const eyeY = this.position.y + this.getEyeHeight();
      if (isExposedToSky(ctx.world.chunkManager, this.position.x, eyeY, this.position.z)) {
        this.extinguish();
      }
    }
  }

  /**
   * Applies periodic environmental damage through the shared damage pipeline:
   * lava contact, burning, suffocation, drowning and void. All are gated by the
   * existing invulnerability frames except void, which bypasses them to
   * guarantee removal. Lava is checked before burning so its heavier contact
   * hit lands first (Beta `setOnFireFromLava`).
   */
  protected applyEnvironmentDamage(ctx: EntityTickContext): void {
    const world = ctx.world.blockUpdateWorld;

    // Lava: immediate contact damage (in addition to ignition).
    if (this.inLava) {
      this.attackEntityFrom(DamageSource.lava(), LAVA_DAMAGE);
    }

    // Burning: periodic fire damage while the timer runs.
    if (this.fire > 0) {
      if (this.fire % FIRE_DAMAGE_INTERVAL === 0) {
        this.attackEntityFrom(DamageSource.fire(), FIRE_DAMAGE);
      }
      this.fire -= 1;
    }

    // Suffocation: eye region inside an opaque full cube.
    if (this.isAlive()) {
      const eyeY = this.position.y + this.getEyeHeight();
      if (isInsideOpaqueBlock(world, ctx.world.blockRegistry, this.position.x, eyeY, this.position.z, this.width)) {
        this.onSuffocate();
        this.attackEntityFrom(DamageSource.suffocate(), SUFFOCATE_DAMAGE);
      }
    }

    // Air / drowning (breathing point is the eye, not the feet).
    if (this.isAlive() && this.isUnderwater()) {
      this.air -= 1;
      if (this.air === -20) {
        this.air = 0;
        this.onDrown();
        this.attackEntityFrom(DamageSource.drown(), DROWN_DAMAGE);
      }
      this.extinguish(); // being submerged extinguishes fire
    } else {
      this.air = this.maxAir; // regenerate while breathing
    }

    // Void: repeated, invulnerability-bypassing damage below the world minimum.
    if (this.position.y < VOID_MIN_Y) {
      this.attackEntityFrom(DamageSource.outOfWorld(), VOID_DAMAGE);
    }
  }

  // ---- Environmental hooks (particles/behaviour may extend) --------------

  protected onEnterWater(): void {
    // Splash feedback hook (no audio/particle framework yet).
  }

  protected onLeaveWater(): void {
    // Hook.
  }

  protected onEnterFire(): void {
    // Hook.
  }

  protected onEnterLava(): void {
    // Hook.
  }

  protected onDrown(): void {
    this.spawnHurtParticles();
  }

  protected onSuffocate(): void {
    // Hook.
  }

  private updateLivingAnimation(): void {
    this.prevLegYaw = this.legYaw;
    this.prevRenderYawOffset = this.renderYawOffset;
    this.prevHeadYaw = this.headYaw;

    const dx = this.position.x - this.previousPosition.x;
    const dz = this.position.z - this.previousPosition.z;
    const moveDistance = Math.sqrt(dx * dx + dz * dz);
    let speed = moveDistance * 4;
    if (speed > 1) speed = 1;
    this.legSwing += (speed - this.legSwing) * 0.4;
    this.legYaw += this.legSwing;

    const bodyDiff = wrapDegrees(this.yaw - this.renderYawOffset);
    const bodyStep = Math.max(-MAX_BODY_TURN_PER_TICK, Math.min(MAX_BODY_TURN_PER_TICK, bodyDiff * 0.3));
    this.renderYawOffset += bodyStep;

    if (moveDistance > 0.01) {
      const headDiff = wrapDegrees(this.yaw - this.headYaw);
      this.headYaw += headDiff * 0.4;
    }
  }

  // ---- Damage / death (shared flow) --------------------------------------

  /**
   * The single entry point for all damage. Applies Beta-style repeated-hit
   * protection: during the invulnerability window (`hurtResistantTime >
   * HURT_RESISTANT_TICKS/2`) a weaker-or-equal hit is rejected and a stronger
   * hit applies only the excess; otherwise a full hit resets the hurt timers.
   * Returns true if damage was applied.
   */
  public attackEntityFrom(source: DamageSource, amount: number): boolean {
    if (this.health <= 0) {
      return false; // reject damage while dead
    }

    this.legYaw = 1.5; // Beta hurt reaction
    this.lastDamageSource = source;
    if (source.attacker) {
      this.lastAttackerPosition = { x: source.attacker.position.x, z: source.attacker.position.z };
      const dx = source.attacker.position.x - this.position.x;
      const dz = source.attacker.position.z - this.position.z;
      this.attackedAtYaw = (Math.atan2(dz, dx) * 180) / Math.PI - this.yaw;
    }

    let applied = amount;
    let fullHit = true;
    const inInvulnWindow = this.hurtResistantTime > HURT_RESISTANT_TICKS / 2;
    if (!source.bypassesInvulnerability && inInvulnWindow) {
      if (amount <= this.lastDamageAmount) {
        return false; // repeated weaker/equal hit during invulnerability
      }
      applied = amount - this.lastDamageAmount; // only the excess
      this.lastDamageAmount = amount;
      fullHit = false;
    } else {
      this.lastDamageAmount = amount;
      if (!source.bypassesInvulnerability) {
        this.hurtResistantTime = HURT_RESISTANT_TICKS;
      }
      this.hurtTime = MAX_HURT_TIME;
      this.maxHurtTime = MAX_HURT_TIME;
    }

    this.health -= applied;

    if (fullHit) {
      this.onHurt(source);
      if (source.appliesKnockback && source.attacker) {
        this.knockBack(source.attacker.position.x, source.attacker.position.z);
      }
    }

    if (this.health <= 0) {
      this.health = 0;
      this.onDeath(source);
    }
    return true;
  }

  public heal(amount: number): void {
    if (this.health <= 0) {
      return;
    }
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  /**
   * Beta knockback: derive the horizontal direction from attacker→target,
   * halve current velocity, push away by `strength`, and add a small vertical
   * pop (capped at 0.4). Applied through velocity only — the shared physics
   * resolves terrain (no teleporting). Safe at zero distance (no horizontal
   * push when the direction is degenerate).
   */
  public knockBack(attackerX: number, attackerZ: number, strength = 0.4): void {
    const dx = this.position.x - attackerX; // away from attacker
    const dz = this.position.z - attackerZ;
    const dist = Math.hypot(dx, dz);
    this.velocity.x *= 0.5;
    this.velocity.y *= 0.5;
    this.velocity.z *= 0.5;
    if (dist >= 1e-6) {
      this.velocity.x += (dx / dist) * strength;
      this.velocity.z += (dz / dist) * strength;
    }
    this.velocity.y += 0.4;
    if (this.velocity.y > 0.4) {
      this.velocity.y = 0.4;
    }
  }

  /** Applies fall damage for the given fall distance (Beta: distance − 3). */
  protected fall(distance: number): void {
    const damage = Math.floor(distance) - FALL_DAMAGE_THRESHOLD;
    if (damage > 0) {
      this.attackEntityFrom(DamageSource.fall(), damage);
    }
  }

  /** Death linger: death animation + delayed removal. Loot already dropped in onDeath. */
  private onDeathTick(): void {
    this.deathTime += 1;
    if (this.deathTime >= DEATH_LINGER_TICKS) {
      this.markRemoved();
    }
  }

  // ---- Hooks -------------------------------------------------------------

  /** Full-hit feedback: hurt particles, sound, recoil flag, panic trigger. */
  protected onHurt(source: DamageSource): void {
    this.recentlyHurt = true;
    this.spawnHurtParticles();
    this.onHurtSound();
    this.onAttackedBy(source);
    if (source.category === 'player') {
      this.onPlayerAttack(source);
    }
  }

  /**
   * Lethal-damage transition (called exactly once, from attackEntityFrom):
   * death sound + particles, exactly-once loot, and notify the killer.
   */
  protected onDeath(source: DamageSource): void {
    this.onDeathSound();
    this.spawnDeathParticles();
    if (!this.lootDropped) {
      this.dropLoot();
      this.lootDropped = true;
    }
    if (source.attacker instanceof LivingEntity) {
      source.attacker.onKillEntity(this);
    }
    this.onKilled(source);
    this.deathTime = 0;
  }

  /** Called on the attacker (if a living entity) when it kills `victim`. */
  public onKillEntity(_victim: LivingEntity): void {
    // Subclasses override (e.g. mobs that react to kills).
  }

  /** Called when attacked by a player. */
  protected onPlayerAttack(_source: DamageSource): void {
    // Subclasses override.
  }

  /** Called whenever this entity is attacked (any source). */
  protected onAttackedBy(_source: DamageSource): void {
    // Subclasses override.
  }

  /** Called once when this entity dies. */
  protected onKilled(_source: DamageSource): void {
    // Subclasses override.
  }

  /** The drops for this entity (Beta `getDropItemId`/`dropFewItems`). */
  protected getDropItems(): Drop[] {
    return [];
  }

  /** Spawns this entity's drops through the shared item system (exactly once). */
  protected dropLoot(): void {
    for (const drop of this.getDropItems()) {
      const item = new DroppedItemEntity(
        this.ctx,
        drop,
        this.position.x,
        this.position.y + 0.3,
        this.position.z,
        10,
      );
      this.ctx.manager.add(item);
    }
  }

  protected spawnHurtParticles(): void {
    this.ctx.particles?.hurt(this.particleOrigin());
  }

  protected spawnDeathParticles(): void {
    this.ctx.particles?.death(this.particleOrigin());
  }

  private particleOrigin(): ParticleOrigin {
    return {
      x: this.position.x,
      y: this.position.y,
      z: this.position.z,
      width: this.width,
      height: this.height,
    };
  }

  protected onHurtSound(): void {
    // Sound hook; no audio system yet.
  }

  protected onDeathSound(): void {
    // Sound hook; no audio system yet.
  }

  protected onLivingSound(): void {
    // Sound hook; no audio system yet.
  }

  // ---- Serialisation -----------------------------------------------------
  //
  // Only health and the minimal death timer are persisted. Hurt, invulnerability,
  // recoil, panic and attacker state are transient and reset on load. A pig
  // saved/unloaded mid-death keeps health=0 and deathTime>0, so it resumes its
  // death linger and is removed WITHOUT re-running onDeath — loot cannot drop
  // twice (onDeath is only ever invoked from attackEntityFrom).

  protected writeLivingNbt(map: Map<string, NbtTag>): void {
    map.set('Health', nbt.short(this.health));
    map.set('DeathTime', nbt.short(this.deathTime));
    // Long-lived environmental state.
    map.set('Fire', nbt.short(this.fire));
    map.set('Air', nbt.short(this.air));
  }

  protected readLivingNbt(data: NbtCompound): void {
    const map = data.value;
    const health = map.get('Health');
    if (health?.type === 'short' || health?.type === 'int') {
      this.health = health.value;
    }
    const deathTime = map.get('DeathTime');
    if (deathTime?.type === 'short' || deathTime?.type === 'int') {
      this.deathTime = deathTime.value;
    }
    const fire = map.get('Fire');
    if (fire?.type === 'short' || fire?.type === 'int') {
      this.fire = fire.value;
    }
    const air = map.get('Air');
    if (air?.type === 'short' || air?.type === 'int') {
      this.air = air.value;
    }
    // Clear transient combat state on load.
    this.hurtTime = 0;
    this.maxHurtTime = 0;
    this.hurtResistantTime = 0;
    this.lastDamageAmount = 0;
    this.attackedAtYaw = 0;
    this.recentlyHurt = false;
    this.lastDamageSource = undefined;
    this.lastAttackerPosition = undefined;
    // Clear transient environmental state (recomputed each tick).
    this.inWater = false;
    this.inLava = false;
    // A loaded dead entity already dropped its loot before being saved.
    this.lootDropped = this.health <= 0;
  }
}
