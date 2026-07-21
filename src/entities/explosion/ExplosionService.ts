import { AABB } from '../../physics/AABB';
import type { BlockRegistry } from '../../blocks/BlockRegistry';
import type { BlockUpdateWorld } from '../../world/BlockUpdateWorld';
import { CHUNK_SIZE_Y } from '../../world/chunkConstants';
import { DamageSource } from '../damage/DamageSource';
import type { Entity } from '../core/Entity';
import type { EntityManager } from '../core/EntityManager';
import { LivingEntity } from '../living/LivingEntity';
import type { Player } from '../../player/Player';
import type { JavaRandom } from '../../world/generation/random/JavaRandom';

export interface ExplosionResult { readonly destroyedBlocks: number; readonly damagedEntities: number; }

/** Beta boundary-ray explosion shared by Creepers and future TNT. */
export class ExplosionService {
  public constructor(
    private readonly world: BlockUpdateWorld,
    private readonly blocks: BlockRegistry,
    private readonly entities: EntityManager,
    private readonly player: Player,
    private readonly rng: JavaRandom,
  ) {}

  public explode(source: Entity, x: number, y: number, z: number, strength: number, flaming = false): ExplosionResult {
    const affected = new Set<string>();
    const samples = 16;
    for (let ix = 0; ix < samples; ix++) for (let iy = 0; iy < samples; iy++) for (let iz = 0; iz < samples; iz++) {
      if (ix !== 0 && ix !== samples - 1 && iy !== 0 && iy !== samples - 1 && iz !== 0 && iz !== samples - 1) continue;
      let dx = ix / (samples - 1) * 2 - 1;
      let dy = iy / (samples - 1) * 2 - 1;
      let dz = iz / (samples - 1) * 2 - 1;
      const length = Math.hypot(dx, dy, dz); dx /= length; dy /= length; dz /= length;
      let power = strength * (0.7 + this.rng.nextFloat() * 0.6);
      let px = x; let py = y; let pz = z;
      while (power > 0) {
        const bx = Math.floor(px); const by = Math.floor(py); const bz = Math.floor(pz);
        if (by < 0 || by >= CHUNK_SIZE_Y || !this.world.isLoaded(bx, bz)) break;
        const id = this.world.getBlock(bx, by, bz);
        if (id !== 0) power -= ((this.blocks.getById(id)?.explosionResistance ?? 1) + 0.3) * 0.3;
        if (power > 0) affected.add(`${bx},${by},${bz}`);
        px += dx * 0.3; py += dy * 0.3; pz += dz * 0.3; power -= 0.225;
      }
    }

    const radius = strength * 2;
    const box = new AABB(x - radius - 1, y - radius - 1, z - radius - 1, x + radius + 1, y + radius + 1, z + radius + 1);
    let damagedEntities = 0;
    for (const entity of this.entities.getEntitiesInAABB(box, (e): e is LivingEntity => e instanceof LivingEntity && e !== source)) {
      const exposure = this.applyEntityBlast(source, entity, x, y, z, radius);
      if (exposure > 0) damagedEntities++;
    }
    if (this.player.getAABB().intersects(box)) {
      const dx = this.player.position.x - x; const dy = this.player.position.y - y; const dz = this.player.position.z - z;
      const distance = Math.hypot(dx, dy, dz) / radius;
      if (distance <= 1) {
        const impact = 1 - distance;
        const damage = Math.floor((impact * impact + impact) / 2 * 8 * radius + 1);
        if (this.player.attackFromMob(damage, source) && distance > 1e-6) {
          this.player.velocity.x += dx / (distance * radius) * impact * 20;
          this.player.velocity.z += dz / (distance * radius) * impact * 20;
        }
        damagedEntities++;
      }
    }

    let destroyedBlocks = 0;
    for (const key of affected) {
      const [bx, by, bz] = key.split(',').map(Number) as [number, number, number];
      const id = this.world.getBlock(bx, by, bz);
      if (id !== 0 && (this.blocks.getById(id)?.explosionResistance ?? 0) < 1_000_000) {
        if (this.world.setBlock(bx, by, bz, 0, { reason: 'world' })) destroyedBlocks++;
      }
    }
    // Fire placement is deliberately a reusable hook point; Creepers pass false.
    void flaming;
    return { destroyedBlocks, damagedEntities };
  }

  private applyEntityBlast(source: Entity, entity: LivingEntity, x: number, y: number, z: number, radius: number): number {
    const dx = entity.position.x - x; const dy = entity.position.y - y; const dz = entity.position.z - z;
    const absolute = Math.hypot(dx, dy, dz); const distance = absolute / radius;
    if (distance > 1 || absolute < 1e-6) return 0;
    const impact = 1 - distance;
    const damage = Math.floor((impact * impact + impact) / 2 * 8 * radius + 1);
    entity.attackEntityFrom(DamageSource.explosion(source), damage);
    entity.velocity.x += dx / absolute * impact;
    entity.velocity.y += dy / absolute * impact;
    entity.velocity.z += dz / absolute * impact;
    return impact;
  }
}
