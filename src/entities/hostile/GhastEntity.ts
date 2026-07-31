import type { EntityTickContext, EntityWorldContext } from '../core/EntityContext';
import { EntityTypeIds } from '../core/EntityType';
import { type NbtCompound, type NbtTag } from '../../nbt/Nbt';
import { FlyingEntity } from '../living/FlyingEntity';
import { GhastModel } from './models/GhastModel';
import { hasLineOfSight } from '../../world/LineOfSight';
import { Difficulty } from '../../world/Difficulty';
import { AABB } from '../../physics/AABB';
import type { Player } from '../../player/Player';
import type { Drop } from '../items/BlockDropResolver';
import { FireballEntity } from '../projectiles/FireballEntity';
import { applyEntityModelVisualState } from '../../rendering/LivingRenderTransform';

/** Beta `EntityGhast` constants. */
const GHAST_HEALTH = 10;
const GHAST_WIDTH = 4;
const GHAST_HEIGHT = 4;
const TARGET_ACQUIRE_RANGE = 100;
const TARGET_ACQUIRE_REFRESH_TICKS = 20;
const ATTACK_RANGE = 64;
const CHARGE_SOUND_TICK = 10;
const FIRE_TICK = 20;
const POST_FIRE_COOLDOWN = -40;
const SHOOTING_STATE_THRESHOLD = 10;
const WAYPOINT_MIN = 1;
const WAYPOINT_MAX = 60;
const WAYPOINT_SPREAD = 16;
const FLIGHT_ACCEL = 0.1;
const FIREBALL_SPAWN_OFFSET = 4;
const FIREBALL_VERTICAL_OFFSET = 0.5;
const DESPAWN_DISTANCE = 128;
const DESPAWN_AGE = 600;

/**
 * Beta 1.7.3 `EntityGhast` (`extends EntityFlying implements IMob`): a 4x4x4
 * fire-immune flyer that wanders on waypoints, acquires the player within 100
 * blocks, and — with line of sight within 64 blocks — charges for 20 ticks then
 * fires a fireball. Its AI is its own (Beta `updatePlayerActionState`); it does
 * NOT use ground pathfinding. Sounds use `getSoundVolume()=10` so the existing
 * audio path treats them as long-range (Beta `SoundManager` semantics), not
 * gain 10.
 */
export class GhastEntity extends FlyingEntity {
  public readonly typeId = EntityTypeIds.Ghast;
  public readonly typeStringId = 'Ghast';
  public override get isHostileMob(): boolean { return true; }

  private waypointX = 0; private waypointY = 0; private waypointZ = 0;
  private courseChangeCooldown = 0;
  private target: Player | null = null;
  private aggroCooldown = 0;
  public prevAttackCounter = 0;
  public attackCounter = 0;
  private model: GhastModel | null = null;

  public constructor(ctx: EntityWorldContext, x: number, y: number, z: number) {
    super(ctx);
    this.setSize(GHAST_WIDTH, GHAST_HEIGHT);
    this.setPosition(x, y, z);
    this.maxHealth = GHAST_HEALTH;
    this.health = GHAST_HEALTH;
    this.isImmuneToFire = true;
    this.rebuildModel();
  }

  protected override getSoundVolume(): number { return 10; }

  public override onTick(ctx: EntityTickContext): void {
    if ((this.ctx.difficulty?.() ?? Difficulty.Normal) === Difficulty.Peaceful) { this.markRemoved(); return; }
    if (this.health > 0) this.updateGhastAi();
    super.onTick(ctx);
    // Face the current heading immediately (Beta sets renderYawOffset = yaw).
    this.renderYawOffset = this.yaw;
    if (!this.removed && this.health > 0) this.updateDespawn();
  }

  /** Beta `updatePlayerActionState` (flight + targeting + attack), inline. */
  private updateGhastAi(): void {
    this.prevAttackCounter = this.attackCounter;

    // ---- Waypoint wandering (Beta EntityGhast flight) ----
    const wdx = this.waypointX - this.position.x;
    const wdy = this.waypointY - this.position.y;
    const wdz = this.waypointZ - this.position.z;
    const waypointDist = Math.hypot(wdx, wdy, wdz) || 1;
    if (waypointDist < WAYPOINT_MIN || waypointDist > WAYPOINT_MAX) {
      this.waypointX = this.position.x + (this.nextFloat() * 2 - 1) * WAYPOINT_SPREAD;
      this.waypointY = this.position.y + (this.nextFloat() * 2 - 1) * WAYPOINT_SPREAD;
      this.waypointZ = this.position.z + (this.nextFloat() * 2 - 1) * WAYPOINT_SPREAD;
    }
    if (this.courseChangeCooldown-- <= 0) {
      this.courseChangeCooldown += this.nextInt(5) + 2;
      if (this.isCourseTraversable(this.waypointX, this.waypointY, this.waypointZ, waypointDist)) {
        this.velocity.x += (wdx / waypointDist) * FLIGHT_ACCEL;
        this.velocity.y += (wdy / waypointDist) * FLIGHT_ACCEL;
        this.velocity.z += (wdz / waypointDist) * FLIGHT_ACCEL;
      } else {
        this.waypointX = this.position.x; this.waypointY = this.position.y; this.waypointZ = this.position.z;
      }
    }

    // ---- Target acquisition (closest player within 100, refreshed every 20) ----
    if (this.target !== null && !this.target.isAlive()) this.target = null;
    if (this.target === null || this.aggroCooldown-- <= 0) {
      this.target = this.acquireTarget();
      if (this.target !== null) this.aggroCooldown = TARGET_ACQUIRE_REFRESH_TICKS;
    }

    // ---- Attack (within 64, line of sight) ----
    const player = this.target;
    if (player !== null && this.distanceSqTo(player) < ATTACK_RANGE * ATTACK_RANGE) {
      const tdx = player.position.x - this.position.x;
      const tdy = player.position.y + (player.height * 0.5) - (this.position.y + this.height * 0.5);
      const tdz = player.position.z - this.position.z;
      this.yaw = -Math.atan2(tdx, tdz) * 180 / Math.PI;
      if (this.canSeeTarget()) {
        if (this.attackCounter === CHARGE_SOUND_TICK) this.emitSound('mob.ghast.charge', 'attack');
        this.attackCounter += 1;
        if (this.attackCounter === FIRE_TICK) {
          this.emitSound('mob.ghast.fireball', 'attack');
          this.spawnFireball(tdx, tdy, tdz);
          this.attackCounter = POST_FIRE_COOLDOWN;
        }
      } else if (this.attackCounter > 0) {
        this.attackCounter -= 1;
      }
    } else {
      this.yaw = -Math.atan2(this.velocity.x, this.velocity.z) * 180 / Math.PI;
      if (this.attackCounter > 0) this.attackCounter -= 1;
    }
  }

  private acquireTarget(): Player | null {
    const player = this.ctx.player;
    if (player === undefined || !player.isAlive() || player.isCreativeMode()) return null;
    if (this.distanceSqTo(player) > TARGET_ACQUIRE_RANGE * TARGET_ACQUIRE_RANGE) return null;
    return player;
  }

  private canSeeTarget(): boolean {
    const player = this.target;
    if (player === null) return false;
    return hasLineOfSight(
      this.ctx.blockUpdateWorld, this.ctx.blockRegistry,
      { x: this.position.x, y: this.position.y + this.getEyeHeight(), z: this.position.z },
      { x: player.position.x, y: player.getEyeY(), z: player.position.z },
    );
  }

  private distanceSqTo(player: Player): number {
    const dx = player.position.x - this.position.x;
    const dy = player.position.y - this.position.y;
    const dz = player.position.z - this.position.z;
    return dx * dx + dy * dy + dz * dz;
  }

  /**
   * Beta `isCourseTraversable`: step a copy of the bounding box along the path
   * to the waypoint, rejecting the course if any solid block overlaps. Cheap
   * block-solid sampling approximates Beta's `getCollidingBoundingBoxes`.
   */
  private isCourseTraversable(wx: number, wy: number, wz: number, dist: number): boolean {
    const stepX = (wx - this.position.x) / dist;
    const stepY = (wy - this.position.y) / dist;
    const stepZ = (wz - this.position.z) / dist;
    const box = this.getAABB();
    const probe = new AABB(box.minX, box.minY, box.minZ, box.maxX, box.maxY, box.maxZ);
    for (let i = 1; i < dist; i++) {
      probe.minX += stepX; probe.minY += stepY; probe.minZ += stepZ;
      probe.maxX += stepX; probe.maxY += stepY; probe.maxZ += stepZ;
      if (this.solidInBox(probe)) return false;
    }
    return true;
  }

  private solidInBox(box: AABB): boolean {
    const world = this.ctx.blockUpdateWorld;
    for (let x = Math.floor(box.minX); x <= Math.floor(box.maxX); x++) {
      for (let y = Math.floor(box.minY); y <= Math.floor(box.maxY); y++) {
        for (let z = Math.floor(box.minZ); z <= Math.floor(box.maxZ); z++) {
          if (this.ctx.blockRegistry.getById(world.getBlock(x, y, z))?.solid) return true;
        }
      }
    }
    return false;
  }

  private spawnFireball(dirX: number, dirY: number, dirZ: number): void {
    const fireball = new FireballEntity(this.ctx, this, dirX, dirY, dirZ);
    const horizontal = Math.hypot(dirX, dirZ) || 1;
    fireball.setPosition(
      this.position.x + (dirX / horizontal) * FIREBALL_SPAWN_OFFSET,
      this.position.y + this.height * 0.5 + FIREBALL_VERTICAL_OFFSET,
      this.position.z + (dirZ / horizontal) * FIREBALL_SPAWN_OFFSET,
    );
    this.ctx.manager.add(fireball);
  }

  /** Beta despawn rules (mirrors `HostileEntity`): >128 blocks or aged-out. */
  private updateDespawn(): void {
    const player = this.ctx.player;
    if (player === undefined) return;
    const dx = player.position.x - this.position.x;
    const dy = player.position.y - this.position.y;
    const dz = player.position.z - this.position.z;
    const distanceSq = dx * dx + dy * dy + dz * dz;
    if (distanceSq > DESPAWN_DISTANCE * DESPAWN_DISTANCE) { this.markRemoved(); return; }
    if (this.age > DESPAWN_AGE && this.nextInt(800) === 0) {
      if (distanceSq < 32 * 32) this.age = 0; else this.markRemoved();
    }
  }

  public override updateRenderInterpolation(alpha: number): void {
    super.updateRenderInterpolation(alpha);
    const model = this.model;
    if (model === null) return;
    const progress = (this.prevAttackCounter + (this.attackCounter - this.prevAttackCounter) * alpha) / FIRE_TICK;
    model.applyChargeSquish(progress);
    model.setShooting(this.attackCounter > SHOOTING_STATE_THRESHOLD);
    model.updateTentacles(this.age + alpha);
    applyEntityModelVisualState(model, model.body, {
      hurtTime: this.hurtTime,
      maxHurtTime: this.maxHurtTime > 0 ? this.maxHurtTime : 10,
      dead: this.isDead(),
      deathTime: this.deathTime,
    });
  }

  protected rebuildModel(): void {
    this.model?.dispose();
    const model = new GhastModel(this.ctx.entityTextures?.get('ghast'), this.ctx.entityTextures?.get('ghastShooting'));
    model.applyRestScale();
    this.model = model;
    this.renderObject = model.root;
    this.ctx.scene.add(model.root);
  }

  protected override disposeRender(): void { this.model?.dispose(); this.model = null; }
  public override onRestore(): void { this.rebuildModel(); }

  protected override getDropItems(): Drop[] {
    // Intentional project deviation (see plan): Ghasts drop Ghast Tears here,
    // not Beta's gunpowder.
    return [{ type: 'item', id: 'ghast_tear', count: 1, metadata: 0 }];
  }

  protected override getAmbientSoundId(): string { return 'mob.ghast.moan'; }
  protected override getHurtSoundId(): string { return 'mob.ghast.scream'; }
  protected override getDeathSoundId(): string { return 'mob.ghast.death'; }

  protected writeEntityNbt(map: Map<string, NbtTag>): void {
    this.writeLivingNbt(map);
    // Beta persists no AI/targeting state; only position/motion/health (base).
  }

  protected readEntityNbt(data: NbtCompound): void {
    this.readLivingNbt(data);
    this.target = null;
  }

  public static deserialize(ctx: EntityWorldContext, data: NbtCompound): GhastEntity {
    const e = new GhastEntity(ctx, 0, 0, 0);
    e.readFromNbt(data);
    return e;
  }
}
