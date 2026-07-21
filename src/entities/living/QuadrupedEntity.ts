import type { EntityWorldContext } from '../core/EntityContext';
import { AnimalEntity, BABY_SCALE } from './AnimalEntity';
import type { QuadrupedModel } from './QuadrupedModel';

/** Ticks over which the death-collapse animation plays (matches the linger). */
const DEATH_ANIM_TICKS = 20;

/**
 * Shared base for four-legged passive mobs (pig, cow, sheep). Owns the
 * quadruped model lifecycle and the common render interpolation (walk pose,
 * hurt flash, death collapse). Subclasses supply the concrete model, dimensions,
 * health and drops — no AI, movement or hazard code is duplicated here.
 */
export abstract class QuadrupedEntity extends AnimalEntity {
  protected model: QuadrupedModel | null = null;

  protected constructor(ctx: EntityWorldContext) {
    super(ctx);
  }

  /** Subclasses create (and configure) their quadruped model. */
  protected abstract createModel(): QuadrupedModel;

  /** Builds/rebuilds the model and attaches it to the scene. */
  protected buildModel(): void {
    if (this.model !== null) {
      this.model.dispose();
    }
    this.model = this.createModel();
    this.renderObject = this.model.root;
    this.applyBabyVisualScale(this.isChild() ? BABY_SCALE : 1);
    this.ctx.scene.add(this.model.root);
  }

  protected override applyBabyVisualScale(scale: number): void {
    this.model?.root.scale.setScalar(scale);
  }

  public override updateRenderInterpolation(alpha: number): void {
    super.updateRenderInterpolation(alpha);
    const model = this.model;
    if (model === null) {
      return;
    }
    const legYaw = this.prevLegYaw + (this.legYaw - this.prevLegYaw) * alpha;
    const bodyYaw = this.prevRenderYawOffset + (this.renderYawOffset - this.prevRenderYawOffset) * alpha;
    const headYaw = this.prevHeadYaw + (this.headYaw - this.prevHeadYaw) * alpha;
    const headPitch = this.prevHeadPitch + (this.headPitch - this.prevHeadPitch) * alpha;
    model.updatePose(legYaw, this.legSwing, bodyYaw, headYaw - bodyYaw, headPitch);

    const flash = !this.isDead() && this.maxHurtTime > 0 ? this.hurtTime / this.maxHurtTime : 0;
    model.setHurtFlash(flash);
    model.setDeathProgress(this.isDead() ? Math.min(this.deathTime / DEATH_ANIM_TICKS, 1) : 0);
  }

  protected override disposeRender(): void {
    if (this.model !== null) {
      this.model.dispose();
      this.model = null;
    }
  }

  public override onRestore(_ctx: EntityWorldContext): void {
    // Same Engine context across a chunk reload; only rebuild visuals.
    this.buildModel();
  }
}
