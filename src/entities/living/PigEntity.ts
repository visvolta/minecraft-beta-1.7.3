import type { EntityTickContext, EntityWorldContext } from '../core/EntityContext';
import { EntityTypeIds } from '../core/EntityType';
import type { NbtCompound, NbtTag } from '../../persistence/nbt/Nbt';
import { AnimalEntity } from './AnimalEntity';
import { PigModel } from './PigModel';
import { WanderTask } from '../ai/tasks/WanderTask';
import { IdleLookTask } from '../ai/tasks/IdleLookTask';
import { DroppedItemEntity } from '../items/DroppedItemEntity';

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
    this.moveSpeed = 0.25;
    this.maxHealth = 10;
    this.health = 10;

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
    const headYaw = this.previousYaw + (this.yaw - this.previousYaw) * alpha;
    model.updatePose(legYaw, this.legSwing, bodyYaw, headYaw - bodyYaw);
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

  protected override dropLoot(ctx: EntityTickContext): void {
    // Beta pigs drop raw pork (0–2); here 1–3 to keep the validation drop
    // reliably observable. Cooked-when-on-fire is deferred.
    const count = 1 + this.nextInt(3);
    const drop = { type: 'item' as const, id: 'porkchop_raw', count, metadata: 0 };
    const item = new DroppedItemEntity(ctx.world, drop, this.position.x, this.position.y + 0.3, this.position.z, 10);
    ctx.world.manager.add(item);
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
