import type { Inventory } from '../inventory/Inventory';
import { ItemStack } from '../inventory/ItemStack';
import type { RecipeMatchResult } from './CraftingRecipe';
import type { ItemEntityManager } from '../entities/items/ItemEntityManager';
import type { Player } from '../player/Player';

export class CraftingGrid {
  private readonly slots: (ItemStack | null)[];
  public readonly width: number;
  public readonly height: number;

  public constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.slots = Array(width * height).fill(null);
  }

  public getStack(index: number): ItemStack | null {
    if (index < 0 || index >= this.slots.length) return null;
    return this.slots[index] ?? null;
  }

  public setStack(index: number, stack: ItemStack | null): void {
    if (index < 0 || index >= this.slots.length) return;
    this.slots[index] = stack;
  }

  public getSlots(): (ItemStack | null)[] {
    return this.slots;
  }

  public clear(): void {
    this.slots.fill(null);
  }

  public isEmpty(): boolean {
    return this.slots.every((s) => s === null || s.count <= 0);
  }

  /**
   * Consumes exact recipe consumption plan (`Recipe matching must return an exact consumption plan`),
   * handling container returns (e.g. bucket_milk -> bucket_empty).
   */
  public consumePlan(
    match: RecipeMatchResult,
    inventory: Inventory,
    itemEntityManager: ItemEntityManager,
    player: Player
  ): void {
    for (const c of match.consumption) {
      const slotStack = this.getStack(c.slotIndex);
      if (slotStack === null || slotStack.count < c.amount) continue;

      slotStack.count -= c.amount;
      if (slotStack.count <= 0) {
        if (c.containerReturn) {
          this.setStack(c.slotIndex, c.containerReturn.clone());
        } else {
          this.setStack(c.slotIndex, null);
        }
      } else {
        if (c.containerReturn) {
          const accepted = inventory.insert(
            c.containerReturn.identity.type,
            c.containerReturn.identity.id,
            c.containerReturn.count,
            c.containerReturn.metadata
          );
          if (accepted < c.containerReturn.count) {
            const eyeY = player.position.y + 1.62;
            itemEntityManager.spawnThrownItem(
              player.position.x,
              eyeY - 0.3,
              player.position.z,
              {
                type: c.containerReturn.identity.type,
                id: c.containerReturn.identity.id,
                count: c.containerReturn.count - accepted,
                metadata: c.containerReturn.metadata
              },
              0, 0.2, 0,
              40
            );
          }
        }
      }
    }
  }
}
