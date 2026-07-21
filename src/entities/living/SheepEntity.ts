import type { EntityWorldContext } from '../core/EntityContext';
import { EntityTypeIds } from '../core/EntityType';
import { nbt, type NbtCompound, type NbtTag } from '../../persistence/nbt/Nbt';
import { QuadrupedEntity } from './QuadrupedEntity';
import { SheepModel } from './SheepModel';
import type { QuadrupedModel } from './QuadrupedModel';
import { WanderTask } from '../ai/tasks/WanderTask';
import { IdleLookTask } from '../ai/tasks/IdleLookTask';
import { PanicTask } from '../ai/tasks/PanicTask';
import { LookAtPlayerTask } from '../ai/tasks/LookAtPlayerTask';
import { GrazeTask } from '../ai/tasks/GrazeTask';
import { BlockIds } from '../../blocks/BlockId';
import type { Drop } from '../items/BlockDropResolver';

/**
 * A sheep (Beta `EntitySheep`), built on the shared {@link QuadrupedEntity}
 * base. Dimensions 0.9×1.3, health 8. Carries persistent fleece state — a
 * colour (0–15) and a sheared flag — and drops one coloured wool block when not
 * sheared. Shearing itself is out of scope, but the state + model are ready for
 * it (the wool layer simply hides).
 */
export class SheepEntity extends QuadrupedEntity {
  public readonly typeId = EntityTypeIds.Sheep;
  public readonly typeStringId = 'Sheep';
  public readonly breedingItemId = 'wheat';

  /** Fleece colour index 0–15 (persisted). */
  public fleeceColor = 0;
  /** Whether the wool has been sheared (persisted; shearing not yet implemented). */
  public sheared = false;

  public constructor(ctx: EntityWorldContext, x: number, y: number, z: number) {
    super(ctx);
    this.initializeAnimal(0.9, 1.3);
    this.setPosition(x, y, z);
    this.moveSpeed = 0.7;
    this.maxHealth = 8;
    this.health = 8;
    this.fleeceColor = SheepEntity.randomFleeceColor(this.nextInt.bind(this));

    this.aiController.addTask(new PanicTask());
    this.aiController.addTask(new GrazeTask(this.ctx.blockUpdateWorld));
    this.aiController.addTask(new WanderTask());
    this.aiController.addTask(new LookAtPlayerTask());
    this.aiController.addTask(new IdleLookTask());

    this.buildModel();
  }

  protected createModel(): QuadrupedModel {
    const model = new SheepModel(this.ctx.entityTextures?.get('sheep'),this.ctx.entityTextures?.get('sheepFur'));
    model.setFleeceColor(this.fleeceColor);
    model.setSheared(this.sheared);
    return model;
  }

  /** Re-applies the fleece state to the live model (after load / future shear). */
  public refreshFleeceModel(): void {
    const model = this.model;
    if (model instanceof SheepModel) {
      model.setFleeceColor(this.fleeceColor);
      model.setSheared(this.sheared);
    }
  }

  /** Regrows the fleece after a successful grazing action. */
  public regrowWool(): void {
    this.sheared = false;
    this.refreshFleeceModel();
  }

  protected override getDropItems(): Drop[] {
    // Beta: one wool block (metadata = fleece colour) only if not sheared.
    if (this.sheared) {
      return [];
    }
    return [{ type: 'block', id: BlockIds.Wool, count: 1, metadata: this.fleeceColor }];
  }

  protected override getAmbientSoundId(): string { return 'mob.sheep'; }
  protected override getHurtSoundId(): string { return 'mob.sheep'; }
  protected override getDeathSoundId(): string { return 'mob.sheep'; }

  /** Beta weighted random fleece colour (mostly white; rare pink). */
  private static randomFleeceColor(nextInt: (bound: number) => number): number {
    const roll = nextInt(100);
    if (roll < 5) return 15; // black
    if (roll < 10) return 7; // gray
    if (roll < 15) return 8; // light gray
    if (roll < 18) return 12; // brown
    return nextInt(500) === 0 ? 6 : 0; // rare pink, else white
  }

  protected writeEntityNbt(map: Map<string, NbtTag>): void {
    this.writeAnimalNbt(map);
    map.set('Color', nbt.byte(this.fleeceColor));
    map.set('Sheared', nbt.byte(this.sheared ? 1 : 0));
  }

  protected readEntityNbt(data: NbtCompound): void {
    this.readAnimalNbt(data);
    const map = data.value;
    const color = map.get('Color');
    if (color?.type === 'byte' || color?.type === 'int') {
      this.fleeceColor = color.value & 15;
    }
    const sheared = map.get('Sheared');
    if (sheared?.type === 'byte' || sheared?.type === 'int') {
      this.sheared = sheared.value !== 0;
    }
    this.refreshFleeceModel();
  }

  protected createChild(x: number, y: number, z: number): SheepEntity {
    return new SheepEntity(this.ctx, x, y, z);
  }

  public static deserialize(ctx: EntityWorldContext, data: NbtCompound): SheepEntity | undefined {
    const entity = new SheepEntity(ctx, 0, 0, 0);
    entity.readFromNbt(data);
    return entity;
  }
}
