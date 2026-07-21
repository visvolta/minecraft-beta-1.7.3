import type { ArmourSlot } from '../items/ArmourMaterial';
import type { Inventory } from './Inventory';
import { ItemStack, getMaxStackSize } from './ItemStack';
import type { PlayerEquipment } from './PlayerEquipment';

export class InventoryTransferService {
  public static leftClickSlot(
    inventory: Inventory,
    slotIndex: number,
    cursorStack: ItemStack | null
  ): { cursorStack: ItemStack | null } {
    const size = inventory.getSlots().length;
    if (slotIndex < 0 || slotIndex >= size) {
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
    const size = inventory.getSlots().length;
    if (slotIndex < 0 || slotIndex >= size) {
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
          slotStack.metadata,
          slotStack.damage
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
        cursorStack.metadata,
        cursorStack.damage
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
    const size = inventory.getSlots().length;
    if (slotIndex < 0 || slotIndex >= size) return;

    const sourceStack = inventory.getStack(slotIndex);
    if (sourceStack === null || sourceStack.count <= 0) return;

    const equipment = inventory.getEquipment();
    const armourSlot = equipment?.getArmourSlot(sourceStack);
    if (equipment !== undefined && armourSlot !== undefined && equipment.getStack(armourSlot) === null) {
      if (sourceStack.count === 1) {
        if (equipment.setStack(armourSlot, sourceStack)) inventory.setStack(slotIndex, null);
      } else {
        const equipped = sourceStack.clone();
        equipped.count = 1;
        if (equipment.setStack(armourSlot, equipped)) sourceStack.count--;
      }
      return;
    }

    const targetSlots: number[] = [];
    if (size === 36) {
      if (slotIndex >= 0 && slotIndex <= 8) {
        for (let i = 9; i <= 35; i++) targetSlots.push(i);
      } else {
        for (let i = 0; i <= 8; i++) targetSlots.push(i);
      }
    } else {
      // General shift-click within a generic inventory isn't typically used alone, 
      // but if called, just try to move it to any other empty/compatible slot.
      for (let i = 0; i < size; i++) {
        if (i !== slotIndex) targetSlots.push(i);
      }
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
          sourceStack.metadata,
          sourceStack.damage
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
    const size = inventory.getSlots().length;
    if (
      hoveredSlotIndex < 0 ||
      hoveredSlotIndex >= size ||
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
      const size = inventory.getSlots().length;
      if (slotIndex < 0 || slotIndex >= size) continue;
      if (cursorStack === null || cursorStack.count <= 0) break;

      const slotStack = inventory.getStack(slotIndex);
      if (slotStack === null) {
        const single = new ItemStack(
          cursorStack.identity.id,
          cursorStack.identity.type,
          1,
          cursorStack.metadata,
          cursorStack.damage
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

  public static leftClickEquipmentSlot(
    equipment: PlayerEquipment,
    slot: ArmourSlot,
    cursorStack: ItemStack | null,
  ): { cursorStack: ItemStack | null } {
    const equipped = equipment.getStack(slot);
    if (cursorStack === null) {
      return { cursorStack: equipment.takeStack(slot) };
    }
    if (!equipment.accepts(slot, cursorStack)) return { cursorStack };
    if (!equipment.setStack(slot, cursorStack)) return { cursorStack };
    return { cursorStack: equipped };
  }

  public static rightClickEquipmentSlot(
    equipment: PlayerEquipment,
    slot: ArmourSlot,
    cursorStack: ItemStack | null,
  ): { cursorStack: ItemStack | null } {
    return this.leftClickEquipmentSlot(equipment, slot, cursorStack);
  }

  public static rightDragEquipmentSlot(
    equipment: PlayerEquipment,
    slot: ArmourSlot,
    cursorStack: ItemStack | null,
  ): { cursorStack: ItemStack | null } {
    if (cursorStack === null || equipment.getStack(slot) !== null || equipment.getArmourSlot(cursorStack) !== slot) {
      return { cursorStack };
    }
    if (cursorStack.count === 1) {
      if (equipment.setStack(slot, cursorStack)) return { cursorStack: null };
      return { cursorStack };
    }
    const single = cursorStack.clone();
    single.count = 1;
    if (equipment.setStack(slot, single)) cursorStack.count--;
    return { cursorStack };
  }

  public static shiftClickEquipmentSlot(
    inventory: Inventory,
    equipment: PlayerEquipment,
    slot: ArmourSlot,
  ): boolean {
    const stack = equipment.getStack(slot);
    if (stack === null) return false;
    const accepted = inventory.insert(
      stack.identity.type,
      stack.identity.id,
      stack.count,
      stack.metadata,
      stack.damage,
    );
    if (accepted !== stack.count) return false;
    equipment.setStack(slot, null);
    return true;
  }

  public static numberKeySwapEquipment(
    inventory: Inventory,
    equipment: PlayerEquipment,
    slot: ArmourSlot,
    hotbarIndex: number,
  ): boolean {
    if (hotbarIndex < 0 || hotbarIndex > 8) return false;
    const hotbarStack = inventory.getStack(hotbarIndex);
    if (!equipment.accepts(slot, hotbarStack)) return false;
    const equipped = equipment.getStack(slot);
    if (!equipment.setStack(slot, hotbarStack)) return false;
    inventory.setStack(hotbarIndex, equipped);
    return true;
  }

  /** Auto-equips or atomically swaps a non-stacked armour item from an ordinary slot. */
  public static autoEquipFromInventorySlot(inventory: Inventory, sourceSlot: number): boolean {
    const equipment = inventory.getEquipment();
    const source = inventory.getStack(sourceSlot);
    if (equipment === undefined || source === null || source.count !== 1) return false;
    const slot = equipment.getArmourSlot(source);
    if (slot === undefined) return false;
    const previous = equipment.getStack(slot);
    if (!equipment.setStack(slot, source)) return false;
    inventory.setStack(sourceSlot, previous);
    return true;
  }

  public static shiftClickBetweenInventories(
    sourceInv: Inventory,
    sourceSlot: number,
    targetInv: Inventory
  ): void {
    const sourceSize = sourceInv.getSlots().length;
    if (sourceSlot < 0 || sourceSlot >= sourceSize) return;

    const sourceStack = sourceInv.getStack(sourceSlot);
    if (sourceStack === null || sourceStack.count <= 0) return;

    const accepted = targetInv.insert(
      sourceStack.identity.type,
      sourceStack.identity.id,
      sourceStack.count,
      sourceStack.metadata,
      sourceStack.damage
    );

    sourceStack.count -= accepted;
    if (sourceStack.count <= 0) {
      sourceInv.setStack(sourceSlot, null);
    }
  }
}
