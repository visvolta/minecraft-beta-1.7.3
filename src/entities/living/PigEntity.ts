import type { EntityWorldContext } from '../core/EntityContext';
import { EntityTypeIds } from '../core/EntityType';
import type { NbtCompound, NbtTag } from '../../persistence/nbt/Nbt';
import { AnimalEntity } from './AnimalEntity';
import { PigModel } from './PigModel';
import { WanderTask } from '../ai/tasks/WanderTask';
import { IdleLookTask } from '../ai/tasks/IdleLookTask';
import { PanicTask } from '../ai/tasks/PanicTask';
import type { Drop } from '../items/BlockDropResolver';

/**
 * A pig — the Stage-1 validation mob (Beta `EntityPig`).
 *
 * Validates the full living-entity pipeline end to end: registration,
 * spawning, rendering, interpolation, shared physics + collision, gravity,
 * health/damage, wandering + idle-looking AI, bounded pathfinding, chunk
 * streaming and save/load. Beta dimensions are 0.9×0.9.
 *
 * Out of scope for Stage 1 (deferred): saddles/riding, breeding, natural
 * spawning, hostile behaviour, combat integration and advanced sounds.
 */
export class PigEntity extends AnimalEntity {
  public readonly typeId = EntityTypeIds.Pig;
  public readonly typeStringId = 'Pig';

  private model: PigModel | null = null;

  public constructor(ctx: EntityWorldContext, x: number, y: number, z: number) {
    super(ctx);
    this.setSize(0.9, 0.9);
    this.setPosition(x, y, z);
    // Beta default land mob moveSpeed (0.7); with the Beta moveFlying model
    // this yields a slow, gradual amble (~0.08 blocks/tick terminal).
    this.moveSpeed = 0.7;
    this.maxHealth = 10;
    this.health = 10;

    // Panic (priority 20) overrides wandering (10) and idle-looking (5).
    this.aiController.addTask(new PanicTask());
    this.aiController.addTask(new WanderTask());
    this.aiController.addTask(new IdleLookTask());

    this.buildModel();
  }

  // ---- Rendering ---------------------------------------------------------

  private buildModel(): void {
    if (this.model !== null) {
      this.model.dispose();
    }
    this.model = new PigModel();
    this.renderObject = this.model.root;
    this.ctx.scene.add(this.model.root);
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
    model.updatePose(legYaw, this.legSwing, bodyYaw, headYaw - bodyYaw);

    // Hurt flash: fades over the hurt timer while alive; off while dead.
    const flash = !this.isDead() && this.maxHurtTime > 0 ? this.hurtTime / this.maxHurtTime : 0;
    model.setHurtFlash(flash);

    // Death collapse over the ~20-tick linger.
    model.setDeathProgress(this.isDead() ? Math.min(this.deathTime / 20, 1) : 0);
  }

  protected override disposeRender(): void {
    if (this.model !== null) {
      this.model.dispose();
      this.model = null;
    }
  }

  public override onRestore(_ctx: EntityWorldContext): void {
    // Context is the same Engine across a chunk reload; only rebuild visuals.
    this.buildModel();
  }

  // ---- Loot --------------------------------------------------------------

  protected override getDropItems(): Drop[] {
    // Beta pigs drop raw pork; kept at 1–3 (Stage 7B decision). Cooked-when-on
    // -fire is deferred. The base dropLoot() spawns these via the shared item
    // system, exactly once.
    const count = 1 + this.nextInt(3);
    return [{ type: 'item', id: 'porkchop_raw', count, metadata: 0 }];
  }

  // ---- Serialisation (type-specific) -------------------------------------

  protected writeEntityNbt(map: Map<string, NbtTag>): void {
    this.writeLivingNbt(map);
  }

  protected readEntityNbt(data: NbtCompound): void {
    this.readLivingNbt(data);
  }

  /** Factory used by the entity-type registry to load a saved pig. */
  public static deserialize(ctx: EntityWorldContext, data: NbtCompound): PigEntity | undefined {
    const entity = new PigEntity(ctx, 0, 0, 0);
    entity.readFromNbt(data);
    return entity;
  }
}
