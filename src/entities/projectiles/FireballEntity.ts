import { DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, Vector3, type Texture } from 'three';
import { attachEntityLighting } from '../../rendering/ChunkRenderer';
import type { NbtCompound, NbtTag } from '../../nbt/Nbt';
import { EntityTypeIds } from '../core/EntityType';
import type { EntityTickContext, EntityWorldContext } from '../core/EntityContext';
import type { Entity } from '../core/Entity';
import { LivingEntity } from '../living/LivingEntity';
import { ProjectileEntity, type ProjectileBlockHit } from './ProjectileEntity';
import { isWaterInAABB } from '../living/HazardDetection';

const PLUS_Z = new Vector3(0, 0, 1);
const TMP_DIR = new Vector3();

/** Beta `EntityFireball` constants. */
const FIREBALL_WIDTH = 1;
const FIREBALL_HEIGHT = 1;
const FIREBALL_EXPLOSION_STRENGTH = 1.0;
const SHOOTER_GRACE_TICKS = 25;
const ACCELERATION_SCALE = 0.1;
const GAUSSIAN_SPREAD = 0.4;
const AIR_DRAG = 0.95;
const WATER_DRAG = 0.8;
const SMOKE_OFFSET_Y = 0.5;
const MAX_LIFETIME_TICKS = 1200;
const BILLBOARD_SCALE = 2.0;
const COLLISION_BORDER = 1.0;

/**
 * Beta 1.7.3 Ghast fireball (`EntityFireball extends Entity`). Reuses the
 * shared {@link ProjectileEntity} swept-collision/impact/removal machinery, but
 * owns its Beta-specific motion: a constant acceleration vector (Gaussian-spread
 * aim × 0.1), air/water drag (0.95 / 0.8), no gravity, and a 25-tick shooter
 * grace. On any impact it delegates to the shared {@link ExplosionService}
 * (strength 1, flaming) and removes itself — no bespoke explosion code.
 *
 * Reflection: a player hit redirects motion along the player's look vector and
 * re-derives the acceleration; the shooter reference is left unchanged (Beta
 * behaviour), so a reflected ball can still kill its Ghast via the blast.
 */
export class FireballEntity extends ProjectileEntity {
  public readonly typeId = EntityTypeIds.Fireball;
  public readonly typeStringId = 'Fireball';

  protected readonly gravity = 0;
  protected readonly drag = AIR_DRAG;
  private accelerationX = 0;
  private accelerationY = 0;
  private accelerationZ = 0;
  private visualRoot: Group | null = null;
  private material: MeshBasicMaterial | null = null;

  public constructor(ctx: EntityWorldContext, shooter: Entity | null, dirX: number, dirY: number, dirZ: number) {
    super(ctx, shooter);
    this.setSize(FIREBALL_WIDTH, FIREBALL_HEIGHT);
    // Beta: aim += gaussian*0.4; acceleration = normalized(aim)*0.1.
    dirX += this.gaussian() * GAUSSIAN_SPREAD;
    dirY += this.gaussian() * GAUSSIAN_SPREAD;
    dirZ += this.gaussian() * GAUSSIAN_SPREAD;
    const len = Math.hypot(dirX, dirY, dirZ) || 1;
    this.accelerationX = (dirX / len) * ACCELERATION_SCALE;
    this.accelerationY = (dirY / len) * ACCELERATION_SCALE;
    this.accelerationZ = (dirZ / len) * ACCELERATION_SCALE;
    this.buildModel();
  }

  public override canBeCollidedWith(): boolean { return true; }
  public override getCollisionBorderSize(): number { return COLLISION_BORDER; }

  protected override shooterGraceTicks(): number { return SHOOTER_GRACE_TICKS; }
  protected override applyAcceleration(): void {
    this.velocity.x += this.accelerationX;
    this.velocity.y += this.accelerationY;
    this.velocity.z += this.accelerationZ;
  }

  /** Beta drag model: air 0.95, water 0.8 (bubble drag), no gravity. */
  protected override applyForces(): void {
    this.applyAcceleration();
    const drag = isWaterInAABB(this.ctx.blockUpdateWorld, this.getAABB()) ? WATER_DRAG : this.drag;
    this.velocity.x *= drag;
    this.velocity.y *= drag;
    this.velocity.z *= drag;
  }

  public override onTick(ctx: EntityTickContext): void {
    if (this.age >= MAX_LIFETIME_TICKS) { this.markRemoved(); return; }
    super.onTick(ctx);
    if (this.removed) return;
    // Beta `spawnParticle("smoke")` trail (pooled, no per-particle Object3D).
    this.ctx.particles?.smoke?.({ x: this.position.x, y: this.position.y + SMOKE_OFFSET_Y, z: this.position.z, width: FIREBALL_WIDTH, height: FIREBALL_HEIGHT });
  }

  protected onBlockImpact(_hit: ProjectileBlockHit): void { this.detonate(); }
  protected onEntityImpact(_entity: LivingEntity | 'player'): void { this.detonate(); }

  private detonate(): void {
    // Source is the fireball itself (not the shooter): Beta passes a null
    // exploder, so the blast damages everyone — including the Ghast shooter —
    // which is what lets a reflected ball kill its originator.
    this.ctx.explode?.(this, this.position.x, this.position.y, this.position.z, FIREBALL_EXPLOSION_STRENGTH, true);
    this.markRemoved();
  }

  /**
   * Player reflection (Beta `attackEntityFrom`): redirect motion along the
   * attacker's look vector and re-derive acceleration. The shooter reference is
   * intentionally left unchanged.
   */
  public deflect(lookX: number, lookY: number, lookZ: number): void {
    const len = Math.hypot(lookX, lookY, lookZ) || 1;
    this.velocity.x = lookX / len;
    this.velocity.y = lookY / len;
    this.velocity.z = lookZ / len;
    this.accelerationX = this.velocity.x * ACCELERATION_SCALE;
    this.accelerationY = this.velocity.y * ACCELERATION_SCALE;
    this.accelerationZ = this.velocity.z * ACCELERATION_SCALE;
  }

  /** Box-Muller Gaussian (`JavaRandom` has no `nextGaussian`). */
  private gaussian(): number {
    const u1 = Math.max(1e-9, this.ctx.rng.nextDouble());
    const u2 = this.ctx.rng.nextDouble();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  public override updateRenderInterpolation(alpha: number): void {
    super.updateRenderInterpolation(alpha);
    const root = this.visualRoot;
    const player = this.ctx.playerPosition;
    if (root === null || player === undefined) return;
    // Billboard: face the plane (+Z) toward the viewer so it is never edge-on.
    TMP_DIR.set(player.x - root.position.x, (player.y + 1.6) - root.position.y, player.z - root.position.z).normalize();
    root.quaternion.setFromUnitVectors(PLUS_Z, TMP_DIR);
  }

  private buildModel(): void {
    const root = new Group();
    const texture: Texture | undefined = this.ctx.entityTextures?.get('fireball');
    this.material = new MeshBasicMaterial({ map: texture ?? null, transparent: true, alphaTest: 0.1, side: DoubleSide });
    if (texture !== undefined) attachEntityLighting(this.material);
    const mesh = new Mesh(new PlaneGeometry(FIREBALL_WIDTH, FIREBALL_HEIGHT), this.material);
    root.add(mesh);
    root.scale.setScalar(BILLBOARD_SCALE);
    this.visualRoot = root;
    this.renderObject = root;
    this.ctx.scene.add(root);
  }

  protected override disposeRender(): void {
    this.visualRoot?.removeFromParent();
    this.material?.dispose();
    this.visualRoot = null;
    this.material = null;
  }
  public override onRestore(): void { this.buildModel(); }

  protected writeEntityNbt(_map: Map<string, NbtTag>): void {
    // Base fields (Pos/Motion) are persisted by Entity; Beta does not persist
    // shooter or acceleration, and a fireball detonates on impact, so nothing
    // type-specific is stored.
  }

  protected readEntityNbt(_data: NbtCompound): void {
    // On reload the shooter and acceleration are gone (Beta-faithful); the
    // fireball coasts on its saved motion until it impacts or times out.
  }

  public static deserialize(ctx: EntityWorldContext, data: NbtCompound): FireballEntity {
    const e = new FireballEntity(ctx, null, 0, 0, 0);
    e.readFromNbt(data);
    return e;
  }
}
