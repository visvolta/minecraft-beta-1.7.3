import type { Inventory } from './Inventory';
import { ItemStack, getMaxStackSize } from './ItemStack';

export class InventoryTransferService {
  public static leftClickSlot(
    inventory: Inventory,
    slotIndex: number,
    cursorStack: ItemStack | null
  ): { cursorStack: ItemStack | null } {
    if (slotIndex < 0 || slotIndex >= 36) {
      return { cursorStack };
    }

    const slotStack = inventory.getStack(slotIndex);

    if (cursorStack === null) {
      if (slotStack !== null) {
        inventory.setStack(slotIndex, null);
        return { cursorStack: slotStack };
      }
      return { cursorStack: null };
    }

    // cursorStack !== null
    if (slotStack === null) {
      inventory.setStack(slotIndex, cursorStack);
      return { cursorStack: null };
    }

    // Both have items
    if (slotStack.matches(cursorStack)) {
      const maxStack = getMaxStackSize(slotStack.identity);
      const space = maxStack - slotStack.count;
      if (space > 0) {
        const toAdd = Math.min(space, cursorStack.count);
        slotStack.count += toAdd;
        cursorStack.count -= toAdd;
        if (cursorStack.count <= 0) {
          return { cursorStack: null };
        }
      }
      return { cursorStack };
    }

    // Incompatible items -> Swap
    inventory.setStack(slotIndex, cursorStack);
    return { cursorStack: slotStack };
  }

  public static rightClickSlot(
    inventory: Inventory,
    slotIndex: number,
    cursorStack: ItemStack | null
  ): { cursorStack: ItemStack | null } {
    if (slotIndex < 0 || slotIndex >= 36) {
      return { cursorStack };
    }

    const slotStack = inventory.getStack(slotIndex);

    if (cursorStack === null) {
      if (slotStack !== null && slotStack.count > 0) {
        const toTake = Math.ceil(slotStack.count / 2);
        const newCursor = new ItemStack(
          slotStack.identity.id,
          slotStack.identity.type,
          toTake,
          slotStack.metadata
        );
        slotStack.count -= toTake;
        if (slotStack.count <= 0) {
          inventory.setStack(slotIndex, null);
        }
        return { cursorStack: newCursor };
      }
      return { cursorStack: null };
    }

    // cursorStack !== null
    if (slotStack === null) {
      const single = new ItemStack(
        cursorStack.identity.id,
        cursorStack.identity.type,
        1,
        cursorStack.metadata
      );
      inventory.setStack(slotIndex, single);
      cursorStack.count--;
      if (cursorStack.count <= 0) {
        return { cursorStack: null };
      }
      return { cursorStack };
    }

    if (slotStack.matches(cursorStack)) {
      const maxStack = getMaxStackSize(slotStack.identity);
      if (slotStack.count < maxStack) {
        slotStack.count++;
        cursorStack.count--;
        if (cursorStack.count <= 0) {
          return { cursorStack: null };
        }
      }
      return { cursorStack };
    }

    // Incompatible items -> Swap
    inventory.setStack(slotIndex, cursorStack);
    return { cursorStack: slotStack };
  }

  public static shiftClickSlot(inventory: Inventory, slotIndex: number): void {
    if (slotIndex < 0 || slotIndex >= 36) return;

    const sourceStack = inventory.getStack(slotIndex);
    if (sourceStack === null || sourceStack.count <= 0) return;

    const targetSlots: number[] = [];
    if (slotIndex >= 0 && slotIndex <= 8) {
      for (let i = 9; i <= 35; i++) targetSlots.push(i);
    } else {
      for (let i = 0; i <= 8; i++) targetSlots.push(i);
    }

    const maxStack = getMaxStackSize(sourceStack.identity);

    // Phase 1: Merge into compatible partial stacks first
    for (const targetIdx of targetSlots) {
      const targetStack = inventory.getStack(targetIdx);
      if (
        targetStack !== null &&
        targetStack.matches(sourceStack) &&
        targetStack.count < maxStack
      ) {
        const space = maxStack - targetStack.count;
        const toAdd = Math.min(space, sourceStack.count);
        targetStack.count += toAdd;
        sourceStack.count -= toAdd;
        if (sourceStack.count <= 0) {
          inventory.setStack(slotIndex, null);
          return;
        }
      }
    }

    // Phase 2: Fill empty slots left-to-right
    for (const targetIdx of targetSlots) {
      const targetStack = inventory.getStack(targetIdx);
      if (targetStack === null) {
        const toAdd = Math.min(maxStack, sourceStack.count);
        const newStack = new ItemStack(
          sourceStack.identity.id,
          sourceStack.identity.type,
          toAdd,
          sourceStack.metadata
        );
        inventory.setStack(targetIdx, newStack);
        sourceStack.count -= toAdd;
        if (sourceStack.count <= 0) {
          inventory.setStack(slotIndex, null);
          return;
        }
      }
    }

    if (sourceStack.count <= 0) {
      inventory.setStack(slotIndex, null);
    }
  }

  public static numberKeySwap(inventory: Inventory, hoveredSlotIndex: number, hotbarIndex: number): void {
    if (
      hoveredSlotIndex < 0 ||
      hoveredSlotIndex >= 36 ||
      hotbarIndex < 0 ||
      hotbarIndex > 8 ||
      hoveredSlotIndex === hotbarIndex
    ) {
      return;
    }

    const a = inventory.getStack(hoveredSlotIndex);
    const b = inventory.getStack(hotbarIndex);
    inventory.setStack(hoveredSlotIndex, b);
    inventory.setStack(hotbarIndex, a);
  }

  public static rightDrag(
    inventory: Inventory,
    dragSlots: ReadonlySet<number>,
    cursorStack: ItemStack | null
  ): { cursorStack: ItemStack | null } {
    if (cursorStack === null || cursorStack.count <= 0 || dragSlots.size === 0) {
      return { cursorStack };
    }

    for (const slotIndex of dragSlots) {
      if (slotIndex < 0 || slotIndex >= 36) continue;
      if (cursorStack === null || cursorStack.count <= 0) break;

      const slotStack = inventory.getStack(slotIndex);
      if (slotStack === null) {
        const single = new ItemStack(
          cursorStack.identity.id,
          cursorStack.identity.type,
          1,
          cursorStack.metadata
        );
        inventory.setStack(slotIndex, single);
        cursorStack.count--;
        if (cursorStack.count <= 0) {
          cursorStack = null;
          break;
        }
      } else if (slotStack.matches(cursorStack)) {
        const maxStack = getMaxStackSize(slotStack.identity);
        if (slotStack.count < maxStack) {
          slotStack.count++;
          cursorStack.count--;
          if (cursorStack.count <= 0) {
            cursorStack = null;
            break;
          }
        }
      }
    }

    return { cursorStack };
  }
}
