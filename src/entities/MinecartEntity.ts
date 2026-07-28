import { Entity } from './core/Entity';
import { EntityTypeIds } from './core/EntityType';
import type { EntityTickContext, EntityWorldContext } from './core/EntityContext';
import { DroppedItemEntity } from './items/DroppedItemEntity';
import { nbt, type NbtCompound, type NbtTag } from '../nbt/Nbt';
import {
  alignVelocityToRail,
  applyPoweredRailEffect,
  applySlopeAcceleration,
  clampHorizontalVelocity,
  findMinecartRail,
  MINECART_DAMAGE_THRESHOLD,
  MINECART_EMPTY_DRAG,
  MINECART_GRAVITY,
  MINECART_HEIGHT,
  MINECART_OCCUPIED_DRAG,
  MINECART_OFF_RAIL_DRAG,
  MINECART_MAX_RAIL_SPEED,
  MINECART_WIDTH,
  applyMinecartPushDrag,
  projectMinecartToRail,
  railYawRadians,
  reconcileMinecartPush,
  updateMinecartYaw,
  type MinecartPush,
} from './minecart/RailPhysics';
import type { RailBlockInfo } from '../world/rails/RailShapes';

const MINECART_ITEM_ID = 328;
const PASSENGER_Y_OFFSET = -0.25;

export class MinecartEntity extends Entity {
  public readonly typeId = EntityTypeIds.Minecart;
  public readonly typeStringId = 'Minecart';

  public damage = 0;
  public hurtTime = 0;
  public hurtDir = 1;
  public rollingAmplitude = 0;
  /**
   * Beta `pushX`/`pushZ`: the direction the cart was last shoved in. Persists
   * across ticks so a player can push a cart along a track.
   */
  public readonly push: MinecartPush = { x: 0, z: 0 };
  /** Beta `isInReverse`: whether the model is facing backwards along travel. */
  public isInReverse = false;

  private ctx: EntityWorldContext;
  private droppedItem = false;

  public constructor(ctx: EntityWorldContext, x: number, y: number, z: number) {
    super();
    this.ctx = ctx;
    this.setSize(MINECART_WIDTH, MINECART_HEIGHT);
    this.stepHeight = 0;
    this.entityCollisionReduction = 0;
    this.setPosition(x, y, z);
  }

  public override canBeCollidedWith(): boolean { return !this.removed; }
  public override canBePushed(): boolean { return !this.removed; }

  public onTick(ctx: EntityTickContext): void {
    this.ctx = ctx.world;
    this.age += 1;
    this.decayDamageState();
    this.sanitiseNumericState();

    this.velocity.y -= MINECART_GRAVITY;
    const rail = findMinecartRail(ctx.world.blockUpdateWorld, this.position.x, this.position.y, this.position.z);
    if (rail === undefined) this.tickOffRail(ctx);
    else this.tickOnRail(ctx, rail);

    this.updatePassengerPosition();
    if (this.riddenByEntity?.removed === true) this.riddenByEntity = null;
  }

  private decayDamageState(): void {
    if (this.hurtTime > 0) this.hurtTime -= 1;
    if (this.damage > 0) this.damage -= 1;
    if (this.rollingAmplitude > 0) this.rollingAmplitude -= 1;
  }

  /**
   * Beta `EntityMinecart.onUpdate`'s on-rail branch, in Beta's own order:
   * slope acceleration, direction alignment, powered-rail effect, snap onto
   * the rail line, clamped move, slope step-down, drag (push-aware), the
   * height-difference speed correction, cell-change redirection, and finally
   * the push reconciliation.
   */
  private tickOnRail(ctx: EntityTickContext, rail: NonNullable<ReturnType<typeof findMinecartRail>>): void {
    const world = ctx.world.blockUpdateWorld;
    const startY = projectMinecartToRail(this.position.x, this.position.y, this.position.z, rail).y;

    applySlopeAcceleration(this.velocity, rail.shape);

    const aligned = alignVelocityToRail(this.velocity, rail);
    this.velocity.x = aligned.x;
    this.velocity.z = aligned.z;

    applyPoweredRailEffect(world, rail, this.velocity);

    const projected = projectMinecartToRail(this.position.x, this.position.y, this.position.z, rail);
    this.position.x = projected.x;
    this.position.y = projected.y;
    this.position.z = projected.z;

    // Beta clamps the *move delta* (and scales it by 0.75 when ridden)
    // without writing the clamp back into motion.
    let moveX = this.velocity.x;
    let moveZ = this.velocity.z;
    if (this.riddenByEntity !== null) {
      moveX *= 0.75;
      moveZ *= 0.75;
    }
    moveX = Math.max(-MINECART_MAX_RAIL_SPEED, Math.min(MINECART_MAX_RAIL_SPEED, moveX));
    moveZ = Math.max(-MINECART_MAX_RAIL_SPEED, Math.min(MINECART_MAX_RAIL_SPEED, moveZ));
    const persistentVelocityX = this.velocity.x;
    const persistentVelocityY = this.velocity.y;
    const persistentVelocityZ = this.velocity.z;
    this.velocity.x = moveX;
    this.velocity.y = 0;
    this.velocity.z = moveZ;
    this.ctx.physics.move(this);
    const blockedX = moveX !== 0 && this.velocity.x === 0;
    const blockedZ = moveZ !== 0 && this.velocity.z === 0;
    this.velocity.x = blockedX ? 0 : persistentVelocityX;
    this.velocity.y = persistentVelocityY;
    this.velocity.z = blockedZ ? 0 : persistentVelocityZ;

    // Drag. Beta applies the push branch only to an unridden cart.
    if (this.riddenByEntity !== null) {
      this.velocity.x *= MINECART_OCCUPIED_DRAG;
      this.velocity.y = 0;
      this.velocity.z *= MINECART_OCCUPIED_DRAG;
    } else {
      applyMinecartPushDrag(this.push, this.velocity);
      this.velocity.x *= MINECART_EMPTY_DRAG;
      this.velocity.y = 0;
      this.velocity.z *= MINECART_EMPTY_DRAG;
    }

    // Beta's slope compensation: the height the cart lost/gained across this
    // move is fed back into speed at 0.05 per block, then Y is snapped to the
    // rail line so the cart hugs an ascending track.
    const correctedRail = findMinecartRail(world, this.position.x, this.position.y, this.position.z) ?? rail;
    const endY = projectMinecartToRail(this.position.x, this.position.y, this.position.z, correctedRail).y;
    const heightDelta = (startY - endY) * 0.025;
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (speed > 0) {
      this.velocity.x = this.velocity.x / speed * (speed + heightDelta);
      this.velocity.z = this.velocity.z / speed * (speed + heightDelta);
    }
    this.position.y = endY;

    // Beta redirects motion along the axis actually crossed when the cart
    // moves into a new cell, which is what carries it around a curve.
    const nextX = Math.floor(this.position.x);
    const nextZ = Math.floor(this.position.z);
    if (nextX !== rail.x || nextZ !== rail.z) {
      const magnitude = Math.hypot(this.velocity.x, this.velocity.z);
      this.velocity.x = magnitude * (nextX - rail.x);
      this.velocity.z = magnitude * (nextZ - rail.z);
    }

    reconcileMinecartPush(this.push, this.velocity);

    this.updateRailOrientation(correctedRail);
  }

  /**
   * Beta's off-rail branch: clamp motion, halve it while grounded, move, then
   * apply the 0.95 airborne drag. Note Beta uses 0.5 on the ground and 0.95
   * in the air — not a single uniform factor.
   */
  private tickOffRail(_ctx: EntityTickContext): void {
    clampHorizontalVelocity(this.velocity);
    if (this.onGround) {
      this.velocity.x *= 0.5;
      this.velocity.y *= 0.5;
      this.velocity.z *= 0.5;
    }
    this.ctx.physics.move(this);
    if (!this.onGround) {
      this.velocity.x *= MINECART_OFF_RAIL_DRAG;
      this.velocity.y *= MINECART_OFF_RAIL_DRAG;
      this.velocity.z *= MINECART_OFF_RAIL_DRAG;
    }
  }


  /**
   * Beta derives minecart yaw from the position delta since the previous
   * tick (not from velocity) and flips 180 degrees when the cart reverses,
   * tracking that with `isInReverse`. Pitch is 0 on track: Beta sets
   * `rotationPitch = 0.0F` unconditionally in `onUpdate`.
   */
  private updateRailOrientation(rail: RailBlockInfo): void {
    const result = updateMinecartYaw(
      this.previousPosition.x,
      this.previousPosition.z,
      this.position.x,
      this.position.z,
      this.yaw,
      this.previousYaw,
      this.isInReverse,
    );
    if (Number.isFinite(result.yaw)) this.yaw = result.yaw;
    else this.yaw = railYawRadians(rail.shape) * 180 / Math.PI;
    this.isInReverse = result.isInReverse;
    this.pitch = 0;
  }

  /**
   * Beta `applyEntityCollision` for carts: a colliding entity both shoves the
   * cart (standard impulse) and sets the push vector, which is what lets a
   * player walk a cart along a track rather than only nudging it once.
   */
  public override applyEntityCollision(other: Entity): void {
    if (other === this.riddenByEntity || other === this.ridingEntity) return;
    super.applyEntityCollision(other);
    this.push.x = this.position.x - other.position.x;
    this.push.z = this.position.z - other.position.z;
  }

  public getMountedYOffset(): number {
    return PASSENGER_Y_OFFSET;
  }

  public updatePassengerPosition(): void {
    const passenger = this.riddenByEntity;
    if (passenger === null) return;
    passenger.position.x = this.position.x;
    passenger.position.y = this.position.y + this.getMountedYOffset();
    passenger.position.z = this.position.z;
    passenger.velocity.x = this.velocity.x;
    passenger.velocity.y = this.velocity.y;
    passenger.velocity.z = this.velocity.z;
  }

  public attackMinecart(amount: number): boolean {
    if (this.removed || amount <= 0) return false;
    this.hurtDir = -this.hurtDir;
    this.hurtTime = 10;
    this.rollingAmplitude = 10;
    this.damage += amount * 10;
    if (this.damage > MINECART_DAMAGE_THRESHOLD) {
      this.destroyAndDrop();
    }
    return true;
  }

  public destroyAndDrop(): void {
    if (this.removed) return;
    this.riddenByEntity?.mountEntity(null);
    this.spawnDropOnce();
    this.markRemoved();
  }

  private spawnDropOnce(): void {
    if (this.droppedItem) return;
    this.droppedItem = true;
    const item = new DroppedItemEntity(this.ctx, { type: 'item', id: MINECART_ITEM_ID, count: 1, metadata: 0 }, this.position.x, this.position.y + 0.2, this.position.z, 10);
    this.ctx.manager.add(item);
  }

  private sanitiseNumericState(): void {
    if (!Number.isFinite(this.position.x) || !Number.isFinite(this.position.y) || !Number.isFinite(this.position.z)) {
      this.setPosition(0, 80, 0);
    }
    if (!Number.isFinite(this.velocity.x)) this.velocity.x = 0;
    if (!Number.isFinite(this.velocity.y)) this.velocity.y = 0;
    if (!Number.isFinite(this.velocity.z)) this.velocity.z = 0;
  }

  protected writeEntityNbt(map: Map<string, NbtTag>): void {
    map.set('Damage', nbt.int(this.damage));
    map.set('HurtTime', nbt.int(this.hurtTime));
    map.set('HurtDir', nbt.int(this.hurtDir));
    map.set('RollingAmplitude', nbt.int(this.rollingAmplitude));
    // Beta persists the push vector as PushX/PushZ. These are new fields, so
    // reads treat them as optional and default to 0 (see readEntityNbt) —
    // minecarts saved before this change still load.
    map.set('PushX', nbt.double(this.push.x));
    map.set('PushZ', nbt.double(this.push.z));
    map.set('InReverse', nbt.byte(this.isInReverse ? 1 : 0));
  }

  protected readEntityNbt(data: NbtCompound): void {
    const damage = data.value.get('Damage');
    if (damage?.type === 'int') this.damage = damage.value;
    const hurtTime = data.value.get('HurtTime');
    if (hurtTime?.type === 'int') this.hurtTime = hurtTime.value;
    const hurtDir = data.value.get('HurtDir');
    if (hurtDir?.type === 'int') this.hurtDir = hurtDir.value >= 0 ? 1 : -1;
    const rolling = data.value.get('RollingAmplitude');
    if (rolling?.type === 'int') this.rollingAmplitude = rolling.value;
    // Optional: absent in saves written before push support existed, in which
    // case the cart simply starts with no push vector.
    const pushX = data.value.get('PushX');
    if (pushX?.type === 'double') this.push.x = pushX.value;
    const pushZ = data.value.get('PushZ');
    if (pushZ?.type === 'double') this.push.z = pushZ.value;
    const inReverse = data.value.get('InReverse');
    if (inReverse?.type === 'byte') this.isInReverse = inReverse.value !== 0;
    this.sanitiseNumericState();
  }

  public static deserialize(ctx: EntityWorldContext, data: NbtCompound): MinecartEntity | undefined {
    const entity = new MinecartEntity(ctx, 0, 0, 0);
    entity.readFromNbt(data);
    return entity;
  }
}
