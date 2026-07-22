import * as THREE from 'three';
import { Entity } from './core/Entity';
import { EntityTypeIds } from './core/EntityType';
import type { EntityTickContext, EntityWorldContext } from './core/EntityContext';
import { AABB } from '../physics/AABB';
import { RailPhysics, type RailInfo } from '../world/redstone/RailPhysics';
import { nbt, type NbtCompound, type NbtTag } from '../persistence/nbt/Nbt';

export class MinecartEntity extends Entity {
  public readonly typeId = EntityTypeIds.Minecart;
  public readonly typeStringId = 'Minecart';

  public damage = 0;
  public hurtTime = 0;
  public hurtDir = 1;

  private ctx: EntityWorldContext;

  public constructor(ctx: EntityWorldContext, x: number, y: number, z: number) {
    super();
    this.ctx = ctx;
    this.setSize(0.98, 0.7);
    this.setPosition(x, y, z);
  }

  public override canBeCollidedWith(): boolean { return !this.removed; }
  public override canBePushed(): boolean { return true; }

  public onTick(ctx: EntityTickContext): void {
    if (this.hurtTime > 0) this.hurtTime--;
    if (this.damage > 0) this.damage--;

    // 1. Gravity
    this.velocity.y -= 0.04;

    // 2. Rail Detection
    const rail = RailPhysics.getRailAt(this.ctx.blockUpdateWorld, this.position.x, this.position.y, this.position.z);

    if (rail) {
      this.tickOnRail(ctx, rail);
    } else {
      this.tickOffRail(ctx);
    }

    // 10. Passenger Update
    if (this.riddenByEntity) {
        this.riddenByEntity.position.x = this.position.x;
        this.riddenByEntity.position.y = this.position.y + this.getMountedYOffset();
        this.riddenByEntity.position.z = this.position.z;
    }
  }

  private tickOnRail(ctx: EntityTickContext, rail: RailInfo): void {
    // 3. Rail Projection
    const projected = RailPhysics.project(this.position.x, this.position.y, this.position.z, rail);
    if (projected) {
        this.position.y = projected[1];
        // Simplified Beta velocity projection
        const ends = RailPhysics.getEndpoints(rail);
        const dx = ends[1][0] - ends[0][0];
        const dz = ends[1][2] - ends[0][2];
        const dist = Math.hypot(dx, dz);
        const motionScale = (this.velocity.x * dx + this.velocity.z * dz) / (dist * dist);
        this.velocity.x = motionScale * dx;
        this.velocity.z = motionScale * dz;

        // 4. Powered Rails
        if (rail.isPowered) {
            if (rail.isActive) {
                const speed = Math.hypot(this.velocity.x, this.velocity.z);
                if (speed > 0.01) {
                    this.velocity.x += (this.velocity.x / speed) * 0.06;
                    this.velocity.z += (this.velocity.z / speed) * 0.06;
                }
            } else {
                this.velocity.x *= 0.5;
                this.velocity.z *= 0.5;
            }
        }
    }

    // 5. Drag
    const drag = this.riddenByEntity ? 0.997 : 0.96;
    this.velocity.x *= drag;
    this.velocity.z *= drag;

    // 6-7. Movement & Collision
    this.move(this.velocity.x, 0, this.velocity.z);

    // 8. Cap Speed
    const maxSpeed = 0.4;
    if (this.velocity.x < -maxSpeed) this.velocity.x = -maxSpeed;
    if (this.velocity.x > maxSpeed) this.velocity.x = maxSpeed;
    if (this.velocity.z < -maxSpeed) this.velocity.z = -maxSpeed;
    if (this.velocity.z > maxSpeed) this.velocity.z = maxSpeed;
  }

  private tickOffRail(_ctx: EntityTickContext): void {
    this.velocity.x *= 0.98;
    this.velocity.z *= 0.98;
    this.move(this.velocity.x, this.velocity.y, this.velocity.z);
  }

  private move(dx: number, dy: number, dz: number): void {
      // Use existing physics engine to move and resolve block collisions
      this.ctx.physics.move(this, dx, dy, dz);
  }

  public getMountedYOffset(): number {
      return 0.5; // Passenger sits in the cart
  }

  protected writeEntityNbt(map: Map<string, NbtTag>): void {
    map.set('Damage', nbt.int(this.damage));
  }

  protected readEntityNbt(data: NbtCompound): void {
    const damage = data.value.get('Damage');
    if (damage?.type === 'int') this.damage = damage.value;
  }

  public static deserialize(ctx: EntityWorldContext, data: NbtCompound): MinecartEntity | undefined {
    const entity = new MinecartEntity(ctx, 0, 0, 0);
    entity.readFromNbt(data);
    return entity;
  }
}
