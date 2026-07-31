import type { EntityTickContext, EntityWorldContext } from '../core/EntityContext';
import { EntityTypeIds } from '../core/EntityType';
import type { NbtCompound, NbtTag } from '../../nbt/Nbt';
import { WaterMobEntity } from './WaterMobEntity';
import { SquidModel } from './SquidModel';
import type { Drop } from '../items/BlockDropResolver';
import { applyEntityModelVisualState } from '../../rendering/LivingRenderTransform';

/** Hurt-flash duration (matches LivingEntity.MAX_HURT_TIME). */
const MAX_HURT_TIME = 10;

/**
 * Beta 1.7.3 `EntitySquid`. Random 3D swimming in water with tentacle
 * animation. Suffocates out of water. Drops ink sac (dye_powder_black, meta 0).
 * No sounds in Beta. Health 10, dimensions 0.95×0.95.
 */
export class SquidEntity extends WaterMobEntity {
  public readonly typeId = EntityTypeIds.Squid;
  public readonly typeStringId = 'Squid';

  // Beta EntitySquid animation state. Both current and previous values are
  // kept so the renderer can interpolate between simulation ticks.
  public tentacleAngle = 0;
  public lastTentacleAngle = 0;
  public squidPitch = 0;
  public prevSquidPitch = 0;
  public squidYaw = 0;
  public prevSquidYaw = 0;
  private squidRotation = 0;
  private rotationVelocity = 0;
  private rotateSpeed = 0;
  private randomMotionVectorX = 0;
  private randomMotionVectorY = 0;
  private randomMotionVectorZ = 0;
  private randomMotionSpeed = 0;
  private model: SquidModel | null = null;

  public constructor(ctx: EntityWorldContext, x: number, y: number, z: number) {
    super(ctx);
    this.setSize(0.95, 0.95);
    this.maxHealth = 10;
    this.health = 10;
    this.setPosition(x, y, z);
    // Beta: rotationVelocity = 1 / (rand.nextFloat() + 1) * 0.2
    this.rotationVelocity = (1 / (this.nextFloat() + 1)) * 0.2;
    this.rebuildModel();
  }

  public override onTick(ctx: EntityTickContext): void {
    super.onTick(ctx);
    if (this.health <= 0) return;

    // Beta `EntitySquid.onLivingUpdate`, transcribed.
    this.prevSquidPitch = this.squidPitch;
    this.prevSquidYaw = this.squidYaw;
    this.lastTentacleAngle = this.tentacleAngle;
    this.squidRotation += this.rotationVelocity;

    if (this.squidRotation > Math.PI * 2) {
      this.squidRotation -= Math.PI * 2;
      // One in ten cycles picks a new stroke rate.
      if (this.nextInt(10) === 0) {
        this.rotationVelocity = (1 / (this.nextFloat() + 1)) * 0.2;
      }
    }

    // Beta `updatePlayerActionState`: re-roll the swim vector periodically or
    // whenever the squid is out of water / has no current heading.
    if (
      this.nextInt(50) === 0 ||
      !this.inWater ||
      (this.randomMotionVectorX === 0 && this.randomMotionVectorY === 0 && this.randomMotionVectorZ === 0)
    ) {
      const angle = this.nextFloat() * Math.PI * 2;
      this.randomMotionVectorX = Math.cos(angle) * 0.2;
      this.randomMotionVectorY = -0.1 + this.nextFloat() * 0.2;
      this.randomMotionVectorZ = Math.sin(angle) * 0.2;
    }

    if (this.inWater) {
      if (this.squidRotation < Math.PI) {
        // First half of the stroke: tentacles flare, and past 75% the squid
        // pushes off (Beta sets both speeds to 1 here).
        const phase = this.squidRotation / Math.PI;
        this.tentacleAngle = Math.sin(phase * phase * Math.PI) * Math.PI * 0.25;
        if (phase > 0.75) {
          this.randomMotionSpeed = 1;
          this.rotateSpeed = 1;
        } else {
          this.rotateSpeed *= 0.8;
        }
      } else {
        // Second half: glide, tentacles straight.
        this.tentacleAngle = 0;
        this.randomMotionSpeed *= 0.9;
        this.rotateSpeed *= 0.99;
      }

      this.velocity.x = this.randomMotionVectorX * this.randomMotionSpeed;
      this.velocity.y = this.randomMotionVectorY * this.randomMotionSpeed;
      this.velocity.z = this.randomMotionVectorZ * this.randomMotionSpeed;

      const horizontal = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
      this.renderYawOffset += (
        (-Math.atan2(this.velocity.x, this.velocity.z) * 180) / Math.PI - this.renderYawOffset
      ) * 0.1;
      this.yaw = this.renderYawOffset;
      this.squidYaw += Math.PI * this.rotateSpeed * 1.5;
      this.squidPitch += ((-Math.atan2(horizontal, this.velocity.y) * 180) / Math.PI - this.squidPitch) * 0.1;
    } else {
      // Beached: tentacles flap and the body tips toward -90°.
      this.tentacleAngle = Math.abs(Math.sin(this.squidRotation)) * Math.PI * 0.25;
      this.squidPitch += (-90 - this.squidPitch) * 0.02;
    }
  }

  protected override getDropItems(): Drop[] {
    const count = 1 + Math.floor(Math.random() * 3);
    return [{ type: 'item', id: 'dye_powder_black', count, metadata: 0 }];
  }

  public override updateRenderInterpolation(alpha: number): void {
    super.updateRenderInterpolation(alpha);
    const model = this.model;
    if (model === null) return;

    // Beta `RenderSquid`: every animated value is interpolated by the partial
    // tick, never sampled from wall-clock time.
    const tentacleAngle = this.lastTentacleAngle + (this.tentacleAngle - this.lastTentacleAngle) * alpha;
    const pitch = this.prevSquidPitch + (this.squidPitch - this.prevSquidPitch) * alpha;
    const yaw = this.prevSquidYaw + (this.squidYaw - this.prevSquidYaw) * alpha;
    model.updatePose(tentacleAngle, pitch, yaw);

    applyEntityModelVisualState(model, model.pose, {
      hurtTime: this.hurtTime,
      maxHurtTime: this.maxHurtTime > 0 ? this.maxHurtTime : MAX_HURT_TIME,
      dead: this.isDead(),
      deathTime: this.deathTime,
    });
  }

  protected rebuildModel(): void {
    this.model?.dispose();
    this.model = new SquidModel(this.ctx.entityTextures?.get('squid'));
    this.renderObject = this.model.root;
    this.ctx.scene.add(this.model.root);
  }
  protected override disposeRender(): void { this.model?.dispose(); this.model = null; }
  public override onRestore(): void { this.rebuildModel(); }

  protected writeEntityNbt(map: Map<string, NbtTag>): void { this.writeLivingNbt(map); }
  protected readEntityNbt(data: NbtCompound): void { this.readLivingNbt(data); }
  public static deserialize(ctx: EntityWorldContext, data: NbtCompound): SquidEntity {
    const e = new SquidEntity(ctx, 0, 0, 0); e.readFromNbt(data); e.rebuildModel(); return e;
  }
}
