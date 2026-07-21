import type { EntityTickContext, EntityWorldContext } from '../core/EntityContext';
import { EntityTypeIds } from '../core/EntityType';
import type { NbtCompound, NbtTag } from '../../persistence/nbt/Nbt';
import { BipedHostileEntity } from './BipedHostileEntity';
import { SkeletonRangedAttackTask } from '../ai/tasks/SkeletonRangedAttackTask';
import { ArrowEntity } from '../projectiles/ArrowEntity';
import { SkeletonModel } from './models/SkeletonModel';
import type { Drop } from '../items/BlockDropResolver';
import { SkeletonBowRenderer } from './rendering/SkeletonBowRenderer';

export class SkeletonEntity extends BipedHostileEntity {
  public readonly typeId = EntityTypeIds.Skeleton;
  public readonly typeStringId = 'Skeleton';
  public readonly meleeDamage = 2;
  public rangedDrawTicks=0;
  private bowRenderer:SkeletonBowRenderer|null=null;
  protected override get usesRangedPose(): boolean { return true; }
  protected override get rangedPoseProgress():number{return this.rangedDrawTicks/20;}
  public constructor(ctx: EntityWorldContext, x: number, y: number, z: number) {
    super(ctx, false); this.setSize(0.6, 1.8); this.setPosition(x, y, z); this.moveSpeed = 0.5;
    this.aiController.addTask(new SkeletonRangedAttackTask()); this.rebuildModel();
  }
  public canShootTarget(): boolean {
    if (!this.target || !this.validateTarget(false) || !this.canSeeTarget()) return false;
    const dx = this.target.position.x - this.position.x; const dz = this.target.position.z - this.position.z;
    return dx * dx + dz * dz < 100;
  }
  public beginRangedDraw():boolean{if(this.attackTime>0||!this.canShootTarget())return false;this.rangedDrawTicks=1;return true;}
  public tickRangedDraw():void{if(!this.canShootTarget()||!this.target){this.cancelRangedDraw();return;}const dx=this.target.position.x-this.position.x,dz=this.target.position.z-this.position.z,targetYaw=Math.atan2(dz,dx)*180/Math.PI-90;this.yaw=targetYaw;this.setHeadLookIntent(targetYaw);this.rangedDrawTicks++;if(this.rangedDrawTicks>=20)this.shootTarget();}
  public cancelRangedDraw():void{this.rangedDrawTicks=0;}
  public shootTarget(): boolean {
    if (!this.canShootTarget() || !this.target) {this.cancelRangedDraw();return false;}
    const arrow = new ArrowEntity(this.ctx, this, this.position.x, this.position.y + 1, this.position.z);
    const dx = this.target.position.x - arrow.position.x; const dz = this.target.position.z - arrow.position.z;
    const horizontal = Math.hypot(dx, dz); const dy = this.target.getEyeY() - 0.2 - arrow.position.y + horizontal * 0.2;
    arrow.launch(dx, dy, dz, 0.6, 12); this.ctx.manager.add(arrow); this.attackTime = 10; this.emitSound('random.bow', 'bow', 1);
    const targetYaw=Math.atan2(dz,dx)*180/Math.PI-90;this.yaw=targetYaw;this.setHeadLookIntent(targetYaw);this.rangedDrawTicks=0;return true;
  }
  public override onTick(ctx: EntityTickContext): void {
    const exposure = this.getDaylightExposure();
    if (exposure.canIgnite && this.nextInt(30000) / 1000 < (exposure.brightness - 0.4) * 2) this.setOnFire(300);
    super.onTick(ctx);
  }
  protected rebuildModel(): void {this.bowRenderer?.dispose();const model=new SkeletonModel(this.ctx.entityTextures?.get('skeleton'));this.attachBiped(model);this.bowRenderer=this.ctx.entityTextures?new SkeletonBowRenderer(model.rightHandAttachment,this.ctx.entityTextures):null;}
  public override updateRenderInterpolation(alpha:number):void{super.updateRenderInterpolation(alpha);this.bowRenderer?.setDrawProgress(this.rangedPoseProgress,this.rangedDrawTicks>0);}
  protected override disposeRender():void{this.bowRenderer?.dispose();this.bowRenderer=null;super.disposeRender();}
  protected override getDropItems(): Drop[] {
    const drops: Drop[]=[]; const arrows=this.nextInt(3); const bones=this.nextInt(3);
    if(arrows)drops.push({type:'item',id:'arrow',count:arrows,metadata:0});
    if(bones)drops.push({type:'item',id:'bone',count:bones,metadata:0}); return drops;
  }
  protected override getAmbientSoundId(): string { return 'mob.skeleton'; }
  protected override getHurtSoundId(): string { return 'mob.skeletonhurt'; }
  protected override getDeathSoundId(): string { return 'mob.skeletonhurt'; }
  protected writeEntityNbt(map: Map<string, NbtTag>): void { this.writeHostileNbt(map); }
  protected readEntityNbt(data: NbtCompound): void { this.readHostileNbt(data);this.rangedDrawTicks=0; }
  public static deserialize(ctx: EntityWorldContext, data: NbtCompound): SkeletonEntity { const e = new SkeletonEntity(ctx, 0, 0, 0); e.readFromNbt(data); return e; }
}
