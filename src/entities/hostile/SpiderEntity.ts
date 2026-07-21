import type { EntityTickContext, EntityWorldContext } from '../core/EntityContext';
import { EntityTypeIds } from '../core/EntityType';
import type { NbtCompound, NbtTag } from '../../persistence/nbt/Nbt';
import { HostileEntity } from './HostileEntity';
import { SpiderModel } from './models/SpiderModel';
import { SpiderLeapTask } from '../ai/tasks/SpiderLeapTask';
import type { Player } from '../../player/Player';
import type { Drop } from '../items/BlockDropResolver';
import { wrapDegrees } from '../living/LivingAnimationMath';
import { interpolateLivingBodyYaw } from '../../rendering/LivingRenderTransform';

export class SpiderEntity extends HostileEntity {
  public readonly typeId = EntityTypeIds.Spider;
  public readonly typeStringId = 'Spider';
  public readonly meleeDamage = 2;
  private model: SpiderModel | null = null;
  public constructor(ctx: EntityWorldContext, x: number, y: number, z: number) {
    super(ctx); this.setSize(1.4, 0.9); this.setPosition(x, y, z); this.moveSpeed = 0.8; this.aiController.addTask(new SpiderLeapTask()); this.buildModel();
  }
  public override acquirePlayerTarget(): Player | null {
    if (this.getDaylightExposure().brightness >= 0.5) return null;
    return super.acquirePlayerTarget();
  }
  public canLeapAtTarget(): boolean {
    if (!this.target || !this.onGround || this.nextInt(10) !== 0) return false;
    const distance = Math.hypot(this.target.position.x - this.position.x, this.target.position.z - this.position.z);
    return distance > 2 && distance < 6;
  }
  public leapAtTarget(): void {
    if (!this.target) return; const dx = this.target.position.x - this.position.x; const dz = this.target.position.z - this.position.z; const length = Math.hypot(dx, dz) || 1;
    this.velocity.x = dx / length * 0.4 + this.velocity.x * 0.2; this.velocity.z = dz / length * 0.4 + this.velocity.z * 0.2; this.velocity.y = 0.4;
  }
  protected override onPreMove(ctx: EntityTickContext): void {
    super.onPreMove(ctx); if (this.isCollidedHorizontally) this.velocity.y = Math.max(this.velocity.y, 0.2);
  }
  public override onTick(ctx: EntityTickContext): void {
    if (this.target && this.getDaylightExposure().brightness > 0.5 && this.nextInt(100) === 0) this.clearTarget();
    super.onTick(ctx);
  }
  protected override getDropItems(): Drop[] { const count=this.nextInt(3); return count ? [{type:'item',id:'string',count,metadata:0}] : []; }
  protected override getAmbientSoundId(): string { return 'mob.spider'; }
  protected override getHurtSoundId(): string { return 'mob.spider'; }
  protected override getDeathSoundId(): string { return 'mob.spiderdeath'; }
  private buildModel(): void { this.model?.dispose(); this.model = new SpiderModel(this.ctx.entityTextures?.get('spider'),this.ctx.entityTextures?.get('spiderEyes')); this.renderObject = this.model.root; this.ctx.scene.add(this.model.root); }
  public override updateRenderInterpolation(alpha: number): void {
    super.updateRenderInterpolation(alpha); if (!this.model) return;
    const body=interpolateLivingBodyYaw(this.prevRenderYawOffset,this.renderYawOffset,alpha);
    const head=this.prevHeadYaw+wrapDegrees(this.headYaw-this.prevHeadYaw)*alpha;
    this.model.updatePose(this.prevLegYaw+(this.legYaw-this.prevLegYaw)*alpha, this.legSwing, wrapDegrees(head-body), this.headPitch);
    const flash=!this.isDead()&&this.maxHurtTime>0?this.hurtTime/this.maxHurtTime:0;
    this.model.setHurtFlash(Math.max(flash,this.isBurning()?0.15:0));
    this.model.root.rotation.z = this.isDead() ? Math.min(this.deathTime / 20, 1) * Math.PI : 0;
  }
  protected override disposeRender(): void { this.model?.dispose(); this.model = null; }
  public override onRestore(): void { this.buildModel(); }
  protected writeEntityNbt(map: Map<string, NbtTag>): void { this.writeHostileNbt(map); }
  protected readEntityNbt(data: NbtCompound): void { this.readHostileNbt(data); }
  public static deserialize(ctx: EntityWorldContext, data: NbtCompound): SpiderEntity { const e = new SpiderEntity(ctx, 0, 0, 0); e.readFromNbt(data); return e; }
}
