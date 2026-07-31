import type { EntityWorldContext } from '../core/EntityContext';
import { HostileEntity } from './HostileEntity';
import { BipedModel } from './models/BipedModel';
import { wrapDegrees } from '../living/LivingAnimationMath';
import { applyEntityModelVisualState, interpolateLivingBodyYaw } from '../../rendering/LivingRenderTransform';

/** Hurt-flash duration (matches LivingEntity.MAX_HURT_TIME). */
const MAX_HURT_TIME = 10;

export abstract class BipedHostileEntity extends HostileEntity {
  protected model: BipedModel | null = null;
  protected constructor(ctx: EntityWorldContext, melee = true) { super(ctx, { melee }); }
  protected buildBiped(color: number, thin = false): void { this.attachBiped(new BipedModel(color, thin)); }
  protected attachBiped(model: BipedModel): void {
    this.model?.dispose(); this.model = model; this.renderObject = model.root; this.ctx.scene.add(model.root);
  }
  protected get usesRangedPose(): boolean { return false; }
  protected get rangedPoseProgress():number{return 0;}
  public override updateRenderInterpolation(alpha: number): void {
    super.updateRenderInterpolation(alpha); if (!this.model) return;
    const attack = this.attackTime > 0 ? 1 - this.attackTime / Math.max(1, this.meleeCooldownTicks) : 0;
    const body = interpolateLivingBodyYaw(this.prevRenderYawOffset,this.renderYawOffset,alpha);
    const head = this.prevHeadYaw + wrapDegrees(this.headYaw - this.prevHeadYaw) * alpha;
    const phase = this.prevLegYaw + (this.legYaw - this.prevLegYaw) * alpha;
    this.model.updatePose(phase,this.legSwing,wrapDegrees(head-body),this.headPitch,attack,this.usesRangedPose,this.rangedPoseProgress);
    // Biped root IS the body group (parts are direct children of root), so it
    // is the correct group to apply death tilt to.
    applyEntityModelVisualState(this.model, this.model.root, {
      hurtTime: this.hurtTime,
      maxHurtTime: this.maxHurtTime > 0 ? this.maxHurtTime : MAX_HURT_TIME,
      dead: this.isDead(),
      deathTime: this.deathTime,
    });
  }
  protected override disposeRender(): void { this.model?.dispose(); this.model = null; }
  public override onRestore(): void { this.rebuildModel(); }
  protected abstract rebuildModel(): void;
}
