import { ItemStack, getMaxStackSize } from './ItemStack';

export class Inventory {
  // Full 36 slots: 0-8 are Hotbar, 9-35 are Main Inventory
  private readonly slots: (ItemStack | null)[] = Array(36).fill(null);

  public constructor() {}

  public getStack(slotIndex: number): ItemStack | null {
    if (slotIndex < 0 || slotIndex >= 36) return null;
    return this.slots[slotIndex] ?? null;
  }

  public setStack(slotIndex: number, stack: ItemStack | null): void {
    if (slotIndex < 0 || slotIndex >= 36) return;
    this.slots[slotIndex] = stack;
  }

  /**
   * Attempts to insert an item stack into the inventory following strict Beta 1.7.3 rules:
   * 1. Merge into existing compatible partial stacks.
   * 2. Fill empty hotbar slots 0-8 (left-to-right).
   * 3. Fill empty main-inventory slots 9-35 (left-to-right).
   * Returns the count of items that were successfully accepted.
   */
  public insert(type: 'block' | 'item', id: number | string, count: number, metadata = 0): number {
    let remaining = count;
    const dummyStack = new ItemStack(id, type, 1, metadata);
    const maxStack = getMaxStackSize(dummyStack.identity);

    // Step 1: Merge into compatible partial stacks first
    for (let i = 0; i < 36; i++) {
      const stack = this.slots[i];
      if (stack !== null && stack !== undefined && stack.matches(dummyStack) && stack.count < maxStack) {
        const space = maxStack - stack.count;
        const toAdd = Math.min(space, remaining);
        stack.count += toAdd;
        remaining -= toAdd;

        if (remaining <= 0) {
          return count; // Fully accepted
        }
      }
    }

    // Step 2: Fill empty hotbar slots 0-8
    for (let i = 0; i < 9; i++) {
      if (this.slots[i] === null) {
        const toAdd = Math.min(maxStack, remaining);
        this.slots[i] = new ItemStack(id, type, toAdd, metadata);
        remaining -= toAdd;

        if (remaining <= 0) {
          return count; // Fully accepted
        }
      }
    }

    // Step 3: Fill empty main-inventory slots 9-35
    for (let i = 9; i < 36; i++) {
      if (this.slots[i] === null) {
        const toAdd = Math.min(maxStack, remaining);
        this.slots[i] = new ItemStack(id, type, toAdd, metadata);
        remaining -= toAdd;

        if (remaining <= 0) {
          return count; // Fully accepted
        }
      }
    }

    return count - remaining; // Return how many items were successfully accepted
  }

  public decrementSlot(slotIndex: number, amount: number): void {
    const stack = this.getStack(slotIndex);
    if (stack === null) return;

    stack.count -= amount;
    if (stack.count <= 0) {
      this.setStack(slotIndex, null);
    }
  }

  public getSlots(): (ItemStack | null)[] {
    return this.slots;
  }

  /**
   * Resets the entire inventory to empty.
   */
  public clear(): void {
    this.slots.fill(null);
  }
}
