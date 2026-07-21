import type { EntityWorldContext } from '../core/EntityContext';
import { EntityTypeIds } from '../core/EntityType';
import type { NbtCompound, NbtTag } from '../../persistence/nbt/Nbt';
import { QuadrupedEntity } from './QuadrupedEntity';
import { CowModel } from './CowModel';
import type { QuadrupedModel } from './QuadrupedModel';
import { WanderTask } from '../ai/tasks/WanderTask';
import { IdleLookTask } from '../ai/tasks/IdleLookTask';
import { PanicTask } from '../ai/tasks/PanicTask';
import { LookAtPlayerTask } from '../ai/tasks/LookAtPlayerTask';
import type { Drop } from '../items/BlockDropResolver';

/**
 * A cow (Beta `EntityCow`), built on the shared {@link QuadrupedEntity} base.
 * Dimensions 0.9×1.3, health 10. Reuses the shared AI/movement/hazard/panic/
 * persistence systems. No milking. Sound hooks only (no audio system yet).
 */
export class CowEntity extends QuadrupedEntity {
  public readonly typeId = EntityTypeIds.Cow;
  public readonly typeStringId = 'Cow';
  public readonly breedingItemId = 'wheat';

  public constructor(ctx: EntityWorldContext, x: number, y: number, z: number) {
    super(ctx);
    this.initializeAnimal(0.9, 1.3);
    this.setPosition(x, y, z);
    this.moveSpeed = 0.7;
    this.maxHealth = 10;
    this.health = 10;

    this.aiController.addTask(new PanicTask());
    this.aiController.addTask(new WanderTask());
    this.aiController.addTask(new LookAtPlayerTask());
    this.aiController.addTask(new IdleLookTask());

    this.buildModel();
  }

  protected createModel(): QuadrupedModel {
    return new CowModel();
  }

  protected override getDropItems(): Drop[] {
    const drops: Drop[] = [];
    // Beta: 0–2 leather (getDropItemId=leather via inherited dropFewItems).
    const leather = this.nextInt(3);
    if (leather > 0) {
      drops.push({ type: 'item', id: 'leather', count: leather, metadata: 0 });
    }
    // Raw beef 1–3 — an intentional post-Beta addition (Beta 1.7.3's source does
    // not drop beef here); documented as a deviation.
    const beef = 1 + this.nextInt(3);
    drops.push({ type: 'item', id: 'beef_raw', count: beef, metadata: 0 });
    return drops;
  }

  protected writeEntityNbt(map: Map<string, NbtTag>): void {
    this.writeAnimalNbt(map);
  }

  protected readEntityNbt(data: NbtCompound): void {
    this.readAnimalNbt(data);
  }

  protected createChild(x: number, y: number, z: number): CowEntity {
    return new CowEntity(this.ctx, x, y, z);
  }

  public static deserialize(ctx: EntityWorldContext, data: NbtCompound): CowEntity | undefined {
    const entity = new CowEntity(ctx, 0, 0, 0);
    entity.readFromNbt(data);
    return entity;
  }
}
