import type { EntityTickContext, EntityWorldContext } from '../core/EntityContext';
import { Entity } from '../core/Entity';
import { LivingEntity } from '../living/LivingEntity';

export interface ProjectileBlockHit { readonly x: number; readonly y: number; readonly z: number; readonly blockId: number; }

/** Reusable swept projectile simulation; concrete types own damage/impact state. */
export abstract class ProjectileEntity extends Entity {
  protected ticksInAir = 0;
  protected constructor(protected readonly ctx: EntityWorldContext, public owner: Entity | null) { super(); }
  protected abstract gravity: number;
  protected abstract drag: number;
  protected abstract onBlockImpact(hit: ProjectileBlockHit): void;
  protected abstract onEntityImpact(entity: LivingEntity | 'player'): void;

  public launch(dx: number, dy: number, dz: number, speed: number, inaccuracy: number): void {
    const length = Math.hypot(dx, dy, dz) || 1;
    const spread = inaccuracy * 0.0075;
    this.velocity.x = (dx / length + (this.ctx.rng.nextFloat() - this.ctx.rng.nextFloat()) * spread) * speed;
    this.velocity.y = (dy / length + (this.ctx.rng.nextFloat() - this.ctx.rng.nextFloat()) * spread) * speed;
    this.velocity.z = (dz / length + (this.ctx.rng.nextFloat() - this.ctx.rng.nextFloat()) * spread) * speed;
    this.yaw = Math.atan2(this.velocity.x, this.velocity.z) * 180 / Math.PI;
    this.pitch = Math.atan2(this.velocity.y, Math.hypot(this.velocity.x, this.velocity.z)) * 180 / Math.PI;
  }

  public onTick(_ctx: EntityTickContext): void {
    this.age += 1; this.ticksInAir += 1;
    const sx = this.position.x; const sy = this.position.y; const sz = this.position.z;
    const distance = Math.hypot(this.velocity.x, this.velocity.y, this.velocity.z);
    const steps = Math.max(1, Math.ceil(distance * 8));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps; const x = sx + this.velocity.x * t; const y = sy + this.velocity.y * t; const z = sz + this.velocity.z * t;
      if (!this.ctx.blockUpdateWorld.isLoaded(x, z)) { this.markRemoved(); return; }
      const bx = Math.floor(x); const by = Math.floor(y); const bz = Math.floor(z); const id = this.ctx.blockUpdateWorld.getBlock(bx, by, bz);
      if (this.ctx.blockRegistry.getById(id)?.solid) { this.setPosition(x, y, z); this.onBlockImpact({ x: bx, y: by, z: bz, blockId: id }); return; }
      const probe = this.getAABB().translated(x - this.position.x, y - this.position.y, z - this.position.z);
      const hits = this.ctx.manager.getEntitiesInAABB(probe, (e): e is LivingEntity => e instanceof LivingEntity && (e !== this.owner || this.ticksInAir >= 5));
      if (hits.length > 0 && (hits[0] !== this.owner || this.ticksInAir >= 5)) { this.setPosition(x, y, z); this.onEntityImpact(hits[0]!); return; }
      if (this.ctx.player && this.ctx.player.getAABB().intersects(probe)) { this.setPosition(x, y, z); this.onEntityImpact('player'); return; }
    }
    this.position.x += this.velocity.x; this.position.y += this.velocity.y; this.position.z += this.velocity.z;
    this.velocity.x *= this.drag; this.velocity.y = this.velocity.y * this.drag - this.gravity; this.velocity.z *= this.drag;
    this.yaw = Math.atan2(this.velocity.x, this.velocity.z) * 180 / Math.PI;
    this.pitch = Math.atan2(this.velocity.y, Math.hypot(this.velocity.x, this.velocity.z)) * 180 / Math.PI;
  }
}
