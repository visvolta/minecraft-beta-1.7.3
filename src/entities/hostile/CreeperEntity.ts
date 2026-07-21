import { nbt, type NbtCompound, type NbtTag } from '../../persistence/nbt/Nbt';
import type { EntityWorldContext } from '../core/EntityContext';
import { EntityTypeIds } from '../core/EntityType';
import { HostileEntity } from './HostileEntity';
import { CreeperModel } from './models/CreeperModel';
import { CreeperSwellTask } from '../ai/tasks/CreeperSwellTask';
import type { Drop } from '../items/BlockDropResolver';
import { wrapDegrees } from '../living/LivingAnimationMath';
import { interpolateLivingBodyYaw } from '../../rendering/LivingRenderTransform';

export class CreeperEntity extends HostileEntity {
  public readonly typeId = EntityTypeIds.Creeper;
  public readonly typeStringId = 'Creeper';
  public readonly meleeDamage = 0;
  public fuseTicks = 0; public previousFuseTicks = 0;
  private model: CreeperModel | null = null;
  public constructor(ctx: EntityWorldContext, x: number, y: number, z: number) {
    super(ctx, { melee: false }); this.setSize(0.6, 1.8); this.setPosition(x, y, z); this.moveSpeed = 0.5; this.aiController.addTask(new CreeperSwellTask()); this.buildModel();
  }
  public shouldSwell(): boolean {
    if (!this.target || !this.validateTarget(false)) return false;
    const distance = Math.hypot(this.target.position.x - this.position.x, this.target.position.y - this.position.y, this.target.position.z - this.position.z);
    return this.fuseTicks > 0 ? distance < 7 : distance < 3;
  }
  public updateFuse(): void {
    if(this.target){const dx=this.target.position.x-this.position.x,dz=this.target.position.z-this.position.z;this.setHeadLookIntent(Math.atan2(dz,dx)*180/Math.PI-90);}
    this.previousFuseTicks = this.fuseTicks;
    if (this.shouldSwell()) { if(this.fuseTicks===0)this.emitSound('random.fuse','fuse',1,0.5); this.fuseTicks++; } else this.defuse();
    if (this.fuseTicks >= 30) { this.fuseTicks = 30; this.ctx.explode?.(this, this.position.x, this.position.y, this.position.z, 3, false); this.markRemoved(); }
  }
  public defuse(): void { this.previousFuseTicks = this.fuseTicks; this.fuseTicks = Math.max(0, this.fuseTicks - 1); }
  protected override getDropItems(): Drop[] { const count=this.nextInt(3); return count ? [{type:'item',id:'gunpowder',count,metadata:0}] : []; }
  protected override getHurtSoundId(): string { return 'mob.creeper'; }
  protected override getDeathSoundId(): string { return 'mob.creeperdeath'; }
  private buildModel(): void { this.model?.dispose(); this.model = new CreeperModel(this.ctx.entityTextures?.get('creeper')); this.renderObject = this.model.root; this.ctx.scene.add(this.model.root); }
  public override updateRenderInterpolation(alpha: number): void {
    super.updateRenderInterpolation(alpha); if (!this.model) return;
    const body=interpolateLivingBodyYaw(this.prevRenderYawOffset,this.renderYawOffset,alpha);const head=this.prevHeadYaw+wrapDegrees(this.headYaw-this.prevHeadYaw)*alpha;
    this.model.updatePose(this.prevLegYaw+(this.legYaw-this.prevLegYaw)*alpha,this.legSwing,wrapDegrees(head-body),this.headPitch);
    this.model.setFuse((this.previousFuseTicks + (this.fuseTicks - this.previousFuseTicks) * alpha) / 28,this.isBurning());
    this.model.root.rotation.z=this.isDead()?Math.min(this.deathTime/20,1)*Math.PI/2:0;
  }
  protected override disposeRender(): void { this.model?.dispose(); this.model = null; }
  public override onRestore(): void { this.buildModel(); }
  protected writeEntityNbt(map: Map<string, NbtTag>): void { this.writeHostileNbt(map); map.set('Fuse', nbt.short(this.fuseTicks)); }
  protected readEntityNbt(data: NbtCompound): void { this.readHostileNbt(data); const t = data.value.get('Fuse'); if (t?.type === 'short' || t?.type === 'int') this.fuseTicks = Math.max(0, Math.min(30, t.value)); this.previousFuseTicks = this.fuseTicks; }
  public static deserialize(ctx: EntityWorldContext, data: NbtCompound): CreeperEntity { const e = new CreeperEntity(ctx, 0, 0, 0); e.readFromNbt(data); return e; }
}
