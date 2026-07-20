import type { ChestContainer } from './ChestContainer';
import { Inventory } from '../inventory/Inventory';
import { ItemStack, getMaxStackSize } from '../inventory/ItemStack';

export class DoubleChestInventoryProxy extends Inventory {
  public constructor(
    private readonly first: ChestContainer,
    private readonly second: ChestContainer
  ) {
    super(54, false);
  }

  public override getStack(slotIndex: number): ItemStack | null {
    if (slotIndex < 0 || slotIndex >= 54) return null;
    if (slotIndex < 27) return this.first.inventory.getStack(slotIndex);
    return this.second.inventory.getStack(slotIndex - 27);
  }

  public override setStack(slotIndex: number, stack: ItemStack | null): void {
    if (slotIndex < 0 || slotIndex >= 54) return;
    if (slotIndex < 27) {
      this.first.inventory.setStack(slotIndex, stack);
    } else {
      this.second.inventory.setStack(slotIndex - 27, stack);
    }
  }

  public override getSlots(): (ItemStack | null)[] {
    return [
      ...this.first.inventory.getSlots(),
      ...this.second.inventory.getSlots(),
    ];
  }

  public override clear(): void {
    this.first.inventory.clear();
    this.second.inventory.clear();
  }

  public override decrementSlot(slotIndex: number, amount: number): void {
    const stack = this.getStack(slotIndex);
    if (stack === null) return;

    stack.count -= amount;
    if (stack.count <= 0) {
      this.setStack(slotIndex, null);
    }
  }

  public override insert(type: 'block' | 'item', id: number | string, count: number, metadata = 0): number {
    let remaining = count;
    const dummyStack = new ItemStack(id, type, 1, metadata);
    const maxStack = getMaxStackSize(dummyStack.identity);

    // Step 1: Merge into compatible partial stacks first
    for (let i = 0; i < 54; i++) {
      const stack = this.getStack(i);
      if (stack !== null && stack !== undefined && stack.matches(dummyStack) && stack.count < maxStack) {
        const space = maxStack - stack.count;
        const toAdd = Math.min(space, remaining);
        stack.count += toAdd;
        remaining -= toAdd;

        if (remaining <= 0) {
          return count;
        }
      }
    }

    // Step 2: Fill empty slots left-to-right
    for (let i = 0; i < 54; i++) {
      if (this.getStack(i) === null) {
        const toAdd = Math.min(maxStack, remaining);
        this.setStack(i, new ItemStack(id, type, toAdd, metadata));
        remaining -= toAdd;

        if (remaining <= 0) {
          return count;
        }
      }
    }

    return count - remaining;
  }
}
