import type { EntityWorldContext } from '../core/EntityContext';
import { EntityTypeIds } from '../core/EntityType';
import type { NbtCompound, NbtTag } from '../../persistence/nbt/Nbt';
import { QuadrupedEntity } from './QuadrupedEntity';
import { PigModel } from './PigModel';
import type { QuadrupedModel } from './QuadrupedModel';
import { WanderTask } from '../ai/tasks/WanderTask';
import { IdleLookTask } from '../ai/tasks/IdleLookTask';
import { LookAtPlayerTask } from '../ai/tasks/LookAtPlayerTask';
import { PanicTask } from '../ai/tasks/PanicTask';
import type { Drop } from '../items/BlockDropResolver';

/**
 * A pig (Beta `EntityPig`), built on the shared {@link QuadrupedEntity} base.
 * Dimensions 0.9×0.9. Drops 1–3 raw pork (Stage-7B decision). Validates the
 * full living-entity pipeline (spawning, rendering, AI, physics, hazards,
 * panic, persistence, chunk streaming).
 */
export class PigEntity extends QuadrupedEntity {
  public readonly typeId = EntityTypeIds.Pig;
  public readonly typeStringId = 'Pig';
  public readonly breedingItemId = 'carrot';

  public constructor(ctx: EntityWorldContext, x: number, y: number, z: number) {
    super(ctx);
    this.initializeAnimal(0.9, 0.9);
    this.setPosition(x, y, z);
    this.moveSpeed = 0.7;
    this.maxHealth = 10;
    this.health = 10;

    // Panic (priority 20) overrides wandering (10) and idle-looking (5).
    this.aiController.addTask(new PanicTask());
    this.aiController.addTask(new WanderTask());
    this.aiController.addTask(new LookAtPlayerTask());
    this.aiController.addTask(new IdleLookTask());

    this.buildModel();
  }

  protected createModel(): QuadrupedModel {
    return new PigModel();
  }

  protected override getDropItems(): Drop[] {
    const count = this.nextInt(3);
    return count === 0 ? [] : [{ type: 'item', id: this.isBurning() ? 'porkchop_cooked' : 'porkchop_raw', count, metadata: 0 }];
  }

  protected override getAmbientSoundId(): string { return 'mob.pig'; }
  protected override getHurtSoundId(): string { return 'mob.pig'; }
  protected override getDeathSoundId(): string { return 'mob.pigdeath'; }

  protected writeEntityNbt(map: Map<string, NbtTag>): void {
    this.writeAnimalNbt(map);
  }

  protected readEntityNbt(data: NbtCompound): void {
    this.readAnimalNbt(data);
  }

  protected createChild(x: number, y: number, z: number): PigEntity {
    return new PigEntity(this.ctx, x, y, z);
  }

  /** Factory used by the entity-type registry to load a saved pig. */
  public static deserialize(ctx: EntityWorldContext, data: NbtCompound): PigEntity | undefined {
    const entity = new PigEntity(ctx, 0, 0, 0);
    entity.readFromNbt(data);
    return entity;
  }
}
