import type { EntityWorldContext } from '../core/EntityContext';
import { HostileEntity } from './HostileEntity';
import { BipedModel } from './models/BipedModel';

export abstract class BipedHostileEntity extends HostileEntity {
  protected model: BipedModel | null = null;
  protected constructor(ctx: EntityWorldContext, melee = true) { super(ctx, { melee }); }
  protected buildBiped(color: number, thin = false): void { this.attachBiped(new BipedModel(color, thin)); }
  protected attachBiped(model: BipedModel): void {
    this.model?.dispose(); this.model = model; this.renderObject = model.root; this.ctx.scene.add(model.root);
  }
  public override updateRenderInterpolation(alpha: number): void {
    super.updateRenderInterpolation(alpha); if (!this.model) return;
    const attack = this.attackTime > 0 ? 1 - this.attackTime / Math.max(1, this.meleeCooldownTicks) : 0;
    this.model.updatePose(this.legYaw, this.legSwing, this.headYaw - this.renderYawOffset, this.headPitch, attack);
    this.model.setHurtFlash(!this.isDead() && this.maxHurtTime > 0 ? this.hurtTime / this.maxHurtTime : 0);
    this.model.root.rotation.z = this.isDead() ? Math.min(this.deathTime / 20, 1) * Math.PI / 2 : 0;
  }
  protected override disposeRender(): void { this.model?.dispose(); this.model = null; }
  public override onRestore(): void { this.rebuildModel(); }
  protected abstract rebuildModel(): void;
}
