import type { EntityTickContext, EntityWorldContext } from '../core/EntityContext';
import { EntityTypeIds } from '../core/EntityType';
import type { NbtCompound, NbtTag } from '../../nbt/Nbt';
import { WaterMobEntity } from './WaterMobEntity';
import { SquidModel } from './SquidModel';
import type { Drop } from '../items/BlockDropResolver';

/**
 * Beta 1.7.3 `EntitySquid`. Random 3D swimming in water with tentacle
 * animation. Suffocates out of water. Drops ink sac (dye_powder_black, meta 0).
 * No sounds in Beta. Health 10, dimensions 0.95×0.95.
 */
export class SquidEntity extends WaterMobEntity {
  public readonly typeId = EntityTypeIds.Squid;
  public readonly typeStringId = 'Squid';

  // Tentacle animation state (Beta).
  public tentacleAngle = 0;
  public lastTentacleAngle = 0;
  private squidRotation = 0;
  private prevSquidRotation = 0;
  private squidRotVelocity = 1;
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
    this.rebuildModel();
  }

  public override onTick(ctx: EntityTickContext): void {
    super.onTick(ctx);
    if (this.health <= 0) return;

    // Beta tentacle animation.
    this.lastTentacleAngle = this.tentacleAngle;
    this.prevSquidRotation = this.squidRotation;
    this.squidRotation += this.squidRotVelocity;
    this.squidRotVelocity *= 0.9;

    if (this.inWater) {
      // Random swim direction (Beta EntitySquid behavior).
      this.squidRotVelocity += (Math.random() * 2 - 1) * 0.1;
      if (this.randomMotionSpeed < 0.5) {
        this.randomMotionSpeed = Math.random();
        const angle = Math.random() * Math.PI * 2;
        const pitch = Math.random() * Math.PI;
        this.randomMotionVectorX = Math.sin(angle) * Math.cos(pitch);
        this.randomMotionVectorY = -Math.sin(pitch);
        this.randomMotionVectorZ = Math.cos(angle) * Math.cos(pitch);
      }
      this.velocity.x += this.randomMotionVectorX * this.randomMotionSpeed * 0.1;
      this.velocity.y += this.randomMotionVectorY * this.randomMotionSpeed * 0.1;
      this.velocity.z += this.randomMotionVectorZ * this.randomMotionSpeed * 0.1;
      this.tentacleAngle = Math.abs(Math.sin(this.squidRotation)) * Math.PI * 0.25;
    } else {
      this.tentacleAngle = Math.sin(this.squidRotation) * Math.PI * 0.25;
    }
    this.randomMotionSpeed *= 0.9;
  }

  protected override getDropItems(): Drop[] {
    const count = 1 + Math.floor(Math.random() * 3);
    return [{ type: 'item', id: 'dye_powder_black', count, metadata: 0 }];
  }

  public override updateRenderInterpolation(alpha: number): void {
    super.updateRenderInterpolation(alpha);
    if (this.model) {
      const interpAngle = this.lastTentacleAngle + (this.tentacleAngle - this.lastTentacleAngle) * alpha;
      const interpRot = this.prevSquidRotation + (this.squidRotation - this.prevSquidRotation) * alpha;
      this.model.updateTentacles(interpAngle, interpRot);
    }
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
