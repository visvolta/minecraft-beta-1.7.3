import { Entity } from './core/Entity';
import { EntityTypeIds } from './core/EntityType';
import type { EntityTickContext, EntityWorldContext } from './core/EntityContext';
import { DroppedItemEntity } from './items/DroppedItemEntity';
import { nbt, type NbtCompound, type NbtTag } from '../persistence/nbt/Nbt';
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
  MINECART_WIDTH,
  projectMinecartToRail,
  railYawRadians,
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

  private tickOnRail(ctx: EntityTickContext, rail: NonNullable<ReturnType<typeof findMinecartRail>>): void {
    applySlopeAcceleration(this.velocity, rail.shape);

    const aligned = alignVelocityToRail(this.velocity, rail);
    this.velocity.x = aligned.x;
    this.velocity.z = aligned.z;

    applyPoweredRailEffect(ctx.world.blockUpdateWorld, rail, this.velocity);

    const projected = projectMinecartToRail(this.position.x, this.position.y, this.position.z, rail);
    this.position.x = projected.x;
    this.position.y = projected.y;
    this.position.z = projected.z;

    clampHorizontalVelocity(this.velocity);
    this.ctx.physics.move(this);

    const correctedRail = findMinecartRail(ctx.world.blockUpdateWorld, this.position.x, this.position.y, this.position.z) ?? rail;
    const corrected = projectMinecartToRail(this.position.x, this.position.y, this.position.z, correctedRail);
    this.position.y = corrected.y;

    const drag = this.riddenByEntity === null ? MINECART_EMPTY_DRAG : MINECART_OCCUPIED_DRAG;
    this.velocity.x *= drag;
    this.velocity.y = 0;
    this.velocity.z *= drag;

    const nextX = Math.floor(this.position.x);
    const nextZ = Math.floor(this.position.z);
    if (nextX !== rail.x || nextZ !== rail.z) {
      const speed = Math.hypot(this.velocity.x, this.velocity.z);
      this.velocity.x = speed * (nextX - rail.x);
      this.velocity.z = speed * (nextZ - rail.z);
    }

    this.updateRailOrientation(correctedRail);
  }

  private tickOffRail(_ctx: EntityTickContext): void {
    clampHorizontalVelocity(this.velocity);
    this.ctx.physics.move(this);
    this.velocity.x *= MINECART_OFF_RAIL_DRAG;
    this.velocity.y *= MINECART_OFF_RAIL_DRAG;
    this.velocity.z *= MINECART_OFF_RAIL_DRAG;
  }


  private updateRailOrientation(rail: RailBlockInfo): void {
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (speed > 0.001) {
      this.yaw = Math.atan2(this.velocity.x, this.velocity.z) * 180 / Math.PI;
    } else if (!Number.isFinite(this.yaw)) {
      this.yaw = railYawRadians(rail.shape) * 180 / Math.PI;
    }

    if (!rail.shape.ascending || speed <= 0.001) {
      if (!rail.shape.ascending) this.pitch = 0;
      return;
    }

    let horizontalMotion = 0;
    if (rail.shape.slopeAxis === 'x') horizontalMotion = this.velocity.x;
    else if (rail.shape.slopeAxis === 'z') horizontalMotion = this.velocity.z;
    const direction = horizontalMotion * (rail.shape.slopeDirection ?? 1) >= 0 ? 1 : -1;
    this.pitch = -Math.atan2(direction, 1) * 180 / Math.PI;
  }

  public override applyEntityCollision(other: Entity): void {
    if (other === this.riddenByEntity || other === this.ridingEntity) return;
    super.applyEntityCollision(other);
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
    this.sanitiseNumericState();
  }

  public static deserialize(ctx: EntityWorldContext, data: NbtCompound): MinecartEntity | undefined {
    const entity = new MinecartEntity(ctx, 0, 0, 0);
    entity.readFromNbt(data);
    return entity;
  }
}
