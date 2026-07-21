import type { EntityTickContext, EntityWorldContext } from '../core/EntityContext';
import { EntityTypeIds } from '../core/EntityType';
import { nbt, type NbtCompound, type NbtTag } from '../../persistence/nbt/Nbt';
import { AnimalEntity } from './AnimalEntity';
import { ChickenModel } from './ChickenModel';
import { WanderTask } from '../ai/tasks/WanderTask';
import { IdleLookTask } from '../ai/tasks/IdleLookTask';
import { PanicTask } from '../ai/tasks/PanicTask';
import { LookAtPlayerTask } from '../ai/tasks/LookAtPlayerTask';
import { DroppedItemEntity } from '../items/DroppedItemEntity';
import type { Drop } from '../items/BlockDropResolver';

const DEATH_ANIM_TICKS = 20;

/**
 * A chicken (Beta `EntityChicken`), a small bird built directly on
 * {@link AnimalEntity} (not a quadruped). Dimensions 0.3×0.4, health 4.
 *
 * Beta behaviours: slow falling (damps downward velocity before movement so
 * fall distance stays small), no fall damage, wing-flap animation, and egg
 * laying on a timer. Drops feather (0–2) plus raw chicken (post-Beta addition).
 */
export class ChickenEntity extends AnimalEntity {
  public readonly typeId = EntityTypeIds.Chicken;
  public readonly typeStringId = 'Chicken';

  private model: ChickenModel | null = null;

  // Wing-flap animation state (Beta).
  public wingRotation = 0;
  public oFlap = 0;
  public destPos = 0;
  public oFlapSpeed = 0;
  public wingRotDelta = 1;

  /** Idle pecking animation phase (head dips periodically while idle). */
  public peckPhase = 0;
  public prevPeckPhase = 0;

  /** Ticks until the next egg is laid (persisted exactly; reset only after laying). */
  public timeUntilNextEgg = 0;

  public constructor(ctx: EntityWorldContext, x: number, y: number, z: number) {
    super(ctx);
    this.setSize(0.3, 0.4);
    this.setPosition(x, y, z);
    this.moveSpeed = 0.7;
    this.maxHealth = 4;
    this.health = 4;
    this.timeUntilNextEgg = this.nextInt(6000) + 6000;

    this.aiController.addTask(new PanicTask());
    this.aiController.addTask(new WanderTask());
    this.aiController.addTask(new LookAtPlayerTask());
    this.aiController.addTask(new IdleLookTask());

    this.buildModel();
  }

  private buildModel(): void {
    if (this.model !== null) {
      this.model.dispose();
    }
    this.model = new ChickenModel();
    this.renderObject = this.model.root;
    this.ctx.scene.add(this.model.root);
  }

  public onTick(ctx: EntityTickContext): void {
    super.onTick(ctx);
    if (this.isDead()) {
      return;
    }
    this.updateWings();
    this.updateEggLaying(ctx);
  }

  /**
   * Beta slow fall: damp downward velocity BEFORE movement/fall-distance
   * processing (via the onPreMove hook), so this tick's descent — and the fall
   * distance derived from it — is already slowed.
   */
  protected override onPreMove(_ctx: EntityTickContext): void {
    if (!this.onGround && this.velocity.y < 0) {
      this.velocity.y *= 0.6;
    }
  }

  /** Chickens take no fall damage (Beta overrides `fall` to a no-op). */
  protected override fall(_distance: number): void {
    // No fall damage.
  }

  private updateWings(): void {
    this.oFlap = this.wingRotation;
    this.oFlapSpeed = this.destPos;
    this.destPos += (this.onGround ? -1 : 4) * 0.3;
    if (this.destPos < 0) this.destPos = 0;
    if (this.destPos > 1) this.destPos = 1;
    if (!this.onGround && this.wingRotDelta < 1) this.wingRotDelta = 1;
    this.wingRotDelta *= 0.9;
    this.wingRotation += this.wingRotDelta * 2;

    // Idle pecking: advance the peck phase while the chicken is settled, so the
    // head periodically dips toward the ground; decay back to level when moving.
    this.prevPeckPhase = this.peckPhase;
    if (this.onGround && this.legSwing < 0.1) {
      this.peckPhase += 0.15;
    } else {
      this.peckPhase *= 0.8;
    }
  }

  private updateEggLaying(ctx: EntityTickContext): void {
    this.timeUntilNextEgg -= 1;
    if (this.timeUntilNextEgg <= 0) {
      // Lay exactly one egg, then reset the timer.
      const egg = new DroppedItemEntity(
        ctx.world,
        { type: 'item', id: 'egg', count: 1, metadata: 0 },
        this.position.x,
        this.position.y + 0.3,
        this.position.z,
        10,
      );
      ctx.world.manager.add(egg);
      this.timeUntilNextEgg = this.nextInt(6000) + 6000;
    }
  }

  protected override getDropItems(): Drop[] {
    const drops: Drop[] = [];
    // Beta: 0–2 feather (getDropItemId=feather via inherited dropFewItems).
    const feather = this.nextInt(3);
    if (feather > 0) {
      drops.push({ type: 'item', id: 'feather', count: feather, metadata: 0 });
    }
    // Raw chicken (1) — an intentional post-Beta addition; documented as a deviation.
    drops.push({ type: 'item', id: 'chicken_raw', count: 1, metadata: 0 });
    return drops;
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
    const wingRotation = this.oFlap + (this.wingRotation - this.oFlap) * alpha;
    const wingSpread = this.oFlapSpeed + (this.destPos - this.oFlapSpeed) * alpha;
    const peckPhase = this.prevPeckPhase + (this.peckPhase - this.prevPeckPhase) * alpha;
    const headPitch = Math.max(0, Math.sin(peckPhase)) * 35;
    model.updatePose(legYaw, this.legSwing, bodyYaw, headYaw - bodyYaw, headPitch, wingRotation, wingSpread);

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
    this.buildModel();
  }

  protected writeEntityNbt(map: Map<string, NbtTag>): void {
    this.writeLivingNbt(map);
    map.set('EggTimer', nbt.int(this.timeUntilNextEgg));
  }

  protected readEntityNbt(data: NbtCompound): void {
    this.readLivingNbt(data);
    const eggTimer = data.value.get('EggTimer');
    if (eggTimer?.type === 'int' || eggTimer?.type === 'short') {
      this.timeUntilNextEgg = eggTimer.value;
    }
  }

  public static deserialize(ctx: EntityWorldContext, data: NbtCompound): ChickenEntity | undefined {
    const entity = new ChickenEntity(ctx, 0, 0, 0);
    entity.readFromNbt(data);
    return entity;
  }
}
