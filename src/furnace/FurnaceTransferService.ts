import type { Inventory } from '../inventory/Inventory';
import { ItemStack, getMaxStackSize } from '../inventory/ItemStack';
import type { FurnaceContainer } from './FurnaceContainer';
import type { SmeltingRegistry } from './SmeltingRegistry';
import type { FuelRegistry } from './FuelRegistry';
import { InventoryTransferService } from '../inventory/InventoryTransferService';

/**
 * Authoritative transfer service for furnace UI (`shift-click routing, input_first priority, read-only output`).
 */
export class FurnaceTransferService {
  public static onClickSlot(
    container: FurnaceContainer,
    inventory: Inventory,
    slotIndex: number,
    cursorStack: ItemStack | null,
    isShiftClick: boolean,
    isRightClick: boolean,
    smeltingRegistry: SmeltingRegistry,
    fuelRegistry: FuelRegistry
  ): { cursorStack: ItemStack | null } {
    if (slotIndex === 2) {
      // Read-only output slot
      const outStack = container.outputSlot;
      if (outStack === null || outStack.count <= 0) return { cursorStack };

      if (!isShiftClick) {
        if (cursorStack === null) {
          container.outputSlot = null;
          return { cursorStack: outStack };
        }
        if (cursorStack.matches(outStack)) {
          const maxStack = getMaxStackSize(cursorStack.identity);
          if (cursorStack.count + outStack.count <= maxStack) {
            cursorStack.count += outStack.count;
            container.outputSlot = null;
            return { cursorStack };
          }
        }
        return { cursorStack }; // Rejects invalid/overflow pickup
      } else {
        // Shift click transactional transfer to player inventory (`Shift-clicking output must be transactional and must not consume or lose items when inventory capacity is insufficient`)
        const accepted = inventory.insert(outStack.identity.type, outStack.identity.id, outStack.count, outStack.metadata);
        outStack.count -= accepted;
        if (outStack.count <= 0) {
          container.outputSlot = null;
        }
        return { cursorStack };
      }
    }

    if (slotIndex === 0 || slotIndex === 1) {
      // Input (0) or Fuel (1) slot
      const current = container.getSlotStack(slotIndex);
      if (!isShiftClick) {
        if (!isRightClick) {
          // Left click
          if (cursorStack === null) {
            container.setSlotStack(slotIndex, null);
            return { cursorStack: current };
          }
          if (current === null) {
            container.setSlotStack(slotIndex, cursorStack);
            return { cursorStack: null };
          }
          if (current.matches(cursorStack)) {
            const maxStack = getMaxStackSize(current.identity);
            const space = maxStack - current.count;
            if (space > 0) {
              const toAdd = Math.min(space, cursorStack.count);
              current.count += toAdd;
              cursorStack.count -= toAdd;
              if (cursorStack.count <= 0) return { cursorStack: null };
            }
            return { cursorStack };
          }
          container.setSlotStack(slotIndex, cursorStack);
          return { cursorStack: current };
        } else {
          // Right click
          if (cursorStack === null) {
            if (current !== null && current.count > 0) {
              const toTake = Math.ceil(current.count / 2);
              const newCursor = new ItemStack(current.identity.id, current.identity.type, toTake, current.metadata);
              current.count -= toTake;
              if (current.count <= 0) container.setSlotStack(slotIndex, null);
              return { cursorStack: newCursor };
            }
            return { cursorStack: null };
          }
          if (current === null) {
            container.setSlotStack(slotIndex, new ItemStack(cursorStack.identity.id, cursorStack.identity.type, 1, cursorStack.metadata));
            cursorStack.count--;
            if (cursorStack.count <= 0) return { cursorStack: null };
            return { cursorStack };
          }
          if (current.matches(cursorStack) && current.count < getMaxStackSize(current.identity)) {
            current.count++;
            cursorStack.count--;
            if (cursorStack.count <= 0) return { cursorStack: null };
            return { cursorStack };
          }
          container.setSlotStack(slotIndex, cursorStack);
          return { cursorStack: current };
        }
      } else {
        // Shift click from input/fuel slot to player inventory
        if (current !== null && current.count > 0) {
          const accepted = inventory.insert(current.identity.type, current.identity.id, current.count, current.metadata);
          current.count -= accepted;
          if (current.count <= 0) container.setSlotStack(slotIndex, null);
        }
        return { cursorStack };
      }
    }

    if (slotIndex >= 3 && slotIndex < 39) {
      // Player inventory slots (3..38 -> inventory 0..35)
      const invIdx = slotIndex - 3;
      if (!isShiftClick) {
        if (!isRightClick) {
          const res = InventoryTransferService.leftClickSlot(inventory, invIdx, cursorStack);
          return { cursorStack: res.cursorStack };
        } else {
          const res = InventoryTransferService.rightClickSlot(inventory, invIdx, cursorStack);
          return { cursorStack: res.cursorStack };
        }
      } else {
        // Shift click from player inventory (`input_first` routing)
        const s = inventory.getStack(invIdx);
        if (s === null || s.count <= 0) return { cursorStack };

        const isSmeltable = smeltingRegistry.getRecipe(s) !== undefined;
        const isFuel = fuelRegistry.isFuel(s);

        if (isSmeltable && isFuel) {
          // Try input slot first
          this.tryInsertIntoFurnaceSlot(container, 0, s);
          if (s.count > 0) {
            this.tryInsertIntoFurnaceSlot(container, 1, s);
          }
        } else if (isSmeltable) {
          this.tryInsertIntoFurnaceSlot(container, 0, s);
        } else if (isFuel) {
          this.tryInsertIntoFurnaceSlot(container, 1, s);
        }

        if (s.count > 0) {
          // If still remaining (or neither smeltable/fuel), do normal hotbar/main transfer
          InventoryTransferService.shiftClickSlot(inventory, invIdx);
        } else {
          inventory.setStack(invIdx, null);
        }
        return { cursorStack };
      }
    }

    return { cursorStack };
  }

  private static tryInsertIntoFurnaceSlot(container: FurnaceContainer, targetSlotIdx: number, stack: ItemStack): void {
    const current = container.getSlotStack(targetSlotIdx);
    const maxStack = getMaxStackSize(stack.identity);
    if (current === null) {
      const toAdd = Math.min(maxStack, stack.count);
      container.setSlotStack(targetSlotIdx, new ItemStack(stack.identity.id, stack.identity.type, toAdd, stack.metadata));
      stack.count -= toAdd;
    } else if (current.matches(stack) && current.count < maxStack) {
      const space = maxStack - current.count;
      const toAdd = Math.min(space, stack.count);
      current.count += toAdd;
      stack.count -= toAdd;
    }
  }

  public static rightDrag(
    container: FurnaceContainer,
    inventory: Inventory,
    dragSlots: ReadonlySet<number>,
    cursorStack: ItemStack | null
  ): { cursorStack: ItemStack | null } {
    if (cursorStack === null || cursorStack.count <= 0 || dragSlots.size === 0) return { cursorStack };

    for (const slotIndex of dragSlots) {
      if (cursorStack === null || cursorStack.count <= 0) break;
      if (slotIndex === 2) continue; // Skip read-only output slot

      if (slotIndex === 0 || slotIndex === 1) {
        const current = container.getSlotStack(slotIndex);
        if (current === null) {
          container.setSlotStack(slotIndex, new ItemStack(cursorStack.identity.id, cursorStack.identity.type, 1, cursorStack.metadata));
          cursorStack.count--;
          if (cursorStack.count <= 0) { cursorStack = null; break; }
        } else if (current.matches(cursorStack) && current.count < getMaxStackSize(current.identity)) {
          current.count++;
          cursorStack.count--;
          if (cursorStack.count <= 0) { cursorStack = null; break; }
        }
      } else if (slotIndex >= 3 && slotIndex < 39) {
        const invIdx = slotIndex - 3;
        const current = inventory.getStack(invIdx);
        if (current === null) {
          inventory.setStack(invIdx, new ItemStack(cursorStack.identity.id, cursorStack.identity.type, 1, cursorStack.metadata));
          cursorStack.count--;
          if (cursorStack.count <= 0) { cursorStack = null; break; }
        } else if (current.matches(cursorStack) && current.count < getMaxStackSize(current.identity)) {
          current.count++;
          cursorStack.count--;
          if (cursorStack.count <= 0) { cursorStack = null; break; }
        }
      }
    }
    return { cursorStack };
  }
}
