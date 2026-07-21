import { BlockIds } from '../../blocks/BlockId';
import type { Inventory } from '../../inventory/Inventory';
import { ItemStack } from '../../inventory/ItemStack';
import type { ItemEntityManager } from '../items/ItemEntityManager';
import { AnimalEntity } from '../living/AnimalEntity';
import { CowEntity } from '../living/CowEntity';
import { SheepEntity } from '../living/SheepEntity';

export type AnimalInteractionResult = 'not-applicable' | 'consumed-success' | 'consumed-rejected';
const SHEARS_DURABILITY = 238;

/** Atomic inventory/entity interactions shared by all passive animals. */
export class AnimalInteractionService {
  public constructor(
    private readonly inventory: Inventory,
    private readonly items: ItemEntityManager,
  ) {}

  public interact(animal: AnimalEntity, selectedSlot: number): AnimalInteractionResult {
    const held = this.inventory.getStack(selectedSlot);
    if (held === null || held.identity.type !== 'item') return 'not-applicable';
    const itemId = held.identity.id;

    if (animal instanceof SheepEntity && itemId === 'shears') {
      if (animal.isChild() || animal.sheared || !animal.isAlive()) return 'consumed-rejected';
      animal.sheared = true;
      animal.refreshFleeceModel();
      const count = 2 + animal.nextInt(3);
      for (let i = 0; i < count; i++) {
        const drop = this.items.spawnItem(animal.position.x, animal.position.y + 1, animal.position.z, {
          type: 'block', id: BlockIds.Wool, count: 1, metadata: animal.fleeceColor,
        }, 10);
        drop.velocity.x += (animal.nextInt(201) - 100) / 1000;
        drop.velocity.y += animal.nextInt(51) / 1000;
        drop.velocity.z += (animal.nextInt(201) - 100) / 1000;
      }
      this.inventory.damageToolInSlot(selectedSlot, 1, SHEARS_DURABILITY);
      return 'consumed-success';
    }

    if (animal instanceof CowEntity && itemId === 'bucket_empty') {
      if (animal.isChild() || !animal.isAlive()) return 'consumed-rejected';
      // Empty buckets are non-stackable in this inventory, so replacement is atomic.
      this.inventory.setStack(selectedSlot, new ItemStack('bucket_milk', 'item', 1, 0));
      return 'consumed-success';
    }

    if (itemId !== animal.breedingItemId) return 'not-applicable';
    if (!animal.isAlive()) return 'consumed-rejected';
    if (animal.isChild()) {
      if (!animal.accelerateGrowth()) return 'consumed-rejected';
      this.inventory.decrementSlot(selectedSlot, 1);
      return 'consumed-success';
    }
    if (!animal.enterLoveMode()) return 'consumed-rejected';
    this.inventory.decrementSlot(selectedSlot, 1);
    return 'consumed-success';
  }
}
