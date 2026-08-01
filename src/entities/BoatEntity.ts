import { Entity } from './core/Entity';
import { EntityTypeIds } from './core/EntityType';
import type { EntityTickContext, EntityWorldContext } from './core/EntityContext';
import { nbt, type NbtCompound, type NbtTag } from '../nbt/Nbt';
import { BlockIds } from '../blocks/BlockId';

/**
 * Beta 1.7.3 `EntityBoat`.
 *
 * Faithful port of Beta's boat: buoyancy from the fraction of the hull in
 * water, per-axis speed clamping, drag that differs in and out of water,
 * rider-driven acceleration, a damage counter that decays over time, and
 * destruction into planks and sticks.
 */

/** Beta `setSize(1.5F, 0.6F)`. */
export const BOAT_WIDTH = 1.5;
export const BOAT_HEIGHT = 0.6;
/** Beta clamps horizontal motion to +/-0.4 per axis. */
const MAX_HORIZONTAL_SPEED = 0.4;
/** Beta drag applied when the boat is not being destroyed. */
const DRAG_HORIZONTAL = 0.99;
const DRAG_VERTICAL = 0.95;
/** Beta buoyancy impulse per unit of submersion. */
const BUOYANCY = 0.04;
/** Beta constant upward drift keeping the boat at the surface. */
const SURFACE_LIFT = 0.007;
/** Beta destroys the boat above this accumulated damage. */
const DAMAGE_THRESHOLD = 40;
/** Beta damage added per hit point. */
const DAMAGE_PER_HIT = 10;
/** Beta hull sampling resolution for buoyancy. */
const BUOYANCY_SLICES = 5;
/** Beta passenger seat offset. */
const RIDER_Y_OFFSET = -0.3;
/** Beta rider steering contribution. */
const RIDER_PUSH = 0.2;
/** Beta breaks the boat on a hard horizontal collision above this speed. */
const CRASH_SPEED = 0.15;

/** Player drive acceleration per tick in the boat's forward direction. */
const BOAT_DRIVE_ACCEL = 0.05;
/** Boat yaw change (degrees) per tick while the rider steers. */
const BOAT_STEER_RATE_DEG = 4.5;

export class BoatEntity extends Entity {
  public override readonly typeId = EntityTypeIds.Boat;
  public override readonly typeStringId = 'Boat';

  /** Beta `boatCurrentDamage`, decays by 1 per tick while positive. */
  public damage = 0;
  /** Beta `boatTimeSinceHit`, drives the rocking animation. */
  public timeSinceHit = 0;
  /** Beta `boatRockDirection`, flips on each hit. */
  public rockDirection = 1;

  /**
   * Player drive input set by PlayerController each tick while the player
   * rides this boat: `driveForward` in [-1, 1] (W/S) and `steer` in [-1, 1]
   * (A/D). Applied in onTick for propulsion and turning.
   */
  public driveForward = 0;
  public steer = 0;

  private ctx: EntityWorldContext;
  private destroyed = false;

  public constructor(ctx: EntityWorldContext, x: number, y: number, z: number) {
    super();
    this.ctx = ctx;
    this.setSize(BOAT_WIDTH, BOAT_HEIGHT);
    this.stepHeight = 0;
    this.setPosition(x, y, z);
  }

  public override canBeCollidedWith(): boolean { return !this.removed; }
  public override canBePushed(): boolean { return !this.removed; }

  /** Beta seats the rider slightly below the hull centre. */
  public getMountedYOffset(): number {
    return RIDER_Y_OFFSET;
  }

  public onTick(tickCtx: EntityTickContext): void {
    this.ctx = tickCtx.world;
    this.age += 1;

    // Drive input is owned by the current rider and set per frame; clear it
    // so a dismounted/abandoned boat coasts rather than continuing to thrust.
    this.driveForward = 0;
    this.steer = 0;

    if (this.timeSinceHit > 0) this.timeSinceHit -= 1;
    if (this.damage > 0) this.damage -= 1;

    const submerged = this.submergedFraction();

    // Beta: buoyancy scales with how much of the hull is under water, and a
    // sinking boat is damped so it settles rather than oscillating.
    this.velocity.y += BUOYANCY * submerged;
    if (this.velocity.y < 0) this.velocity.y /= 2;
    this.velocity.y += SURFACE_LIFT;

    // Player drive input propels and steers the boat (Beta boat control).
    if (this.riddenByEntity !== null) {
      const yawRad = this.yaw * Math.PI / 180;
      const forwardX = -Math.sin(yawRad);
      const forwardZ = -Math.cos(yawRad);
      this.velocity.x += forwardX * this.driveForward * BOAT_DRIVE_ACCEL;
      this.velocity.z += forwardZ * this.driveForward * BOAT_DRIVE_ACCEL;
      if (this.steer !== 0) {
        this.yaw += this.steer * BOAT_STEER_RATE_DEG;
        this.previousYaw = this.yaw;
      }
    }

    // The rider's own motion pushes the boat (Beta's only steering input).
    const rider = this.riddenByEntity;
    if (rider !== null) {
      this.velocity.x += rider.velocity.x * RIDER_PUSH;
      this.velocity.z += rider.velocity.z * RIDER_PUSH;
    }

    this.clampHorizontalSpeed();

    const previousX = this.position.x;
    const previousZ = this.position.z;
    this.ctx.physics.move(this);

    const speed = Math.hypot(this.velocity.x, this.velocity.z);

    // Beta smashes the boat against walls when moving fast enough.
    if (this.isCollidedHorizontally && speed > CRASH_SPEED) {
      this.destroyIntoParts();
      return;
    }

    this.velocity.x *= DRAG_HORIZONTAL;
    this.velocity.y *= DRAG_VERTICAL;
    this.velocity.z *= DRAG_HORIZONTAL;

    this.updateYawFromMotion(previousX, previousZ);
    this.updateRiderPosition();
  }

  /**
   * Beta turns the boat to face its direction of travel, limited to 20
   * degrees per tick so it swings smoothly rather than snapping.
   */
  private updateYawFromMotion(previousX: number, previousZ: number): void {
    this.pitch = 0;
    const dx = previousX - this.position.x;
    const dz = previousZ - this.position.z;
    if (dx * dx + dz * dz <= 0.001) return;

    let target = Math.atan2(dz, dx) * 180 / Math.PI;
    let delta = target - this.yaw;
    while (delta >= 180) delta -= 360;
    while (delta < -180) delta += 360;
    if (delta > 20) delta = 20;
    if (delta < -20) delta = -20;
    this.yaw += delta;
  }

  /** Keeps a mounted player sitting in the boat. */
  public updateRiderPosition(): void {
    const rider = this.riddenByEntity;
    if (rider === null) return;
    rider.position.x = this.position.x;
    rider.position.y = this.position.y + this.getMountedYOffset();
    rider.position.z = this.position.z;
  }

  private clampHorizontalSpeed(): void {
    if (this.velocity.x < -MAX_HORIZONTAL_SPEED) this.velocity.x = -MAX_HORIZONTAL_SPEED;
    if (this.velocity.x > MAX_HORIZONTAL_SPEED) this.velocity.x = MAX_HORIZONTAL_SPEED;
    if (this.velocity.z < -MAX_HORIZONTAL_SPEED) this.velocity.z = -MAX_HORIZONTAL_SPEED;
    if (this.velocity.z > MAX_HORIZONTAL_SPEED) this.velocity.z = MAX_HORIZONTAL_SPEED;
  }

  /**
   * Beta samples the hull in five horizontal slices and returns how much of
   * it sits in water, mapped to its -1..+1 buoyancy range.
   */
  private submergedFraction(): number {
    let inWater = 0;
    for (let slice = 0; slice < BUOYANCY_SLICES; slice++) {
      const y = this.position.y + this.height * (slice + 0.5) / BUOYANCY_SLICES;
      const blockId = this.ctx.blockUpdateWorld.getBlock(
        Math.floor(this.position.x), Math.floor(y), Math.floor(this.position.z),
      );
      if (blockId === BlockIds.WaterStill || blockId === BlockIds.WaterFlowing) {
        inWater += 1 / BUOYANCY_SLICES;
      }
    }
    // Beta maps 0..1 submersion onto -1..+1 so a dry boat falls.
    return inWater * 2 - 1;
  }

  /**
   * Beta `attackEntityFrom`: accumulates damage, flips the rocking direction,
   * and breaks apart past the threshold. Returns true when the hit landed.
   */
  public attackEntityFrom(amount: number): boolean {
    if (this.removed) return false;
    this.rockDirection = -this.rockDirection;
    this.timeSinceHit = 10;
    this.damage += amount * DAMAGE_PER_HIT;
    if (this.damage > DAMAGE_THRESHOLD) {
      this.ejectRider();
      this.destroyIntoParts();
    }
    return true;
  }

  /** Beta drops three planks and two sticks, then removes the boat. */
  private destroyIntoParts(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.ejectRider();
    this.dropParts?.(this.position.x, this.position.y, this.position.z);
    this.markRemoved();
  }

  /**
   * Spawns the boat's wreckage. Injected so the entity stays independent of
   * the item-entity system (and can be exercised headlessly).
   */
  public dropParts?: (x: number, y: number, z: number) => void;

  private ejectRider(): void {
    const rider = this.riddenByEntity;
    if (rider === null) return;
    rider.ridingEntity = null;
    this.riddenByEntity = null;
  }

  protected writeEntityNbt(map: Map<string, NbtTag>): void {
    map.set('Damage', nbt.int(this.damage));
    map.set('TimeSinceHit', nbt.int(this.timeSinceHit));
    map.set('RockDirection', nbt.int(this.rockDirection));
  }

  protected readEntityNbt(data: NbtCompound): void {
    const damage = data.value.get('Damage');
    if (damage?.type === 'int') this.damage = damage.value;
    const timeSinceHit = data.value.get('TimeSinceHit');
    if (timeSinceHit?.type === 'int') this.timeSinceHit = timeSinceHit.value;
    const rockDirection = data.value.get('RockDirection');
    if (rockDirection?.type === 'int') this.rockDirection = rockDirection.value >= 0 ? 1 : -1;
  }

  public static deserialize(ctx: EntityWorldContext, data: NbtCompound): BoatEntity | undefined {
    const entity = new BoatEntity(ctx, 0, 0, 0);
    entity.readFromNbt(data);
    return entity;
  }
}
