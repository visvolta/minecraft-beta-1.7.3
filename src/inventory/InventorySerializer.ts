import { Inventory } from './Inventory';
import { ItemStack } from './ItemStack';
import type { SerializedItemStack } from '../persistence/metadata/WorldMetadata';

export class InventorySerializer {
  /**
   * Serializes the player's 36-slot inventory and active selected hotbar slot.
   */
  public static serialize(inventory: Inventory, selectedSlot: number = 0): {
    inventory: (SerializedItemStack | null)[];
    selectedHotbarSlot: number;
  } {
    const slots = inventory.getSlots();
    const serializedSlots = slots.map((stack) => {
      if (stack === null) return null;
      return {
        id: stack.identity.id,
        count: stack.count,
        metadata:stack.metadata,
        damage:stack.damage,
        type: stack.identity.type,
      };
    });

    return {
      inventory: serializedSlots,
      selectedHotbarSlot: selectedSlot,
    };
  }

  /**
   * Deserializes and restores the player's inventory from world metadata.
   */
  public static deserialize(
    inventory: Inventory,
    serializedInventory?: (SerializedItemStack | null)[],
  ): void {
    inventory.clear();
    if (!serializedInventory || !Array.isArray(serializedInventory)) return;

    const size = inventory.getSlots().length;
    for (let i = 0; i < Math.min(size, serializedInventory.length); i++) {
      const data = serializedInventory[i];
      if (data && data.id !== undefined && data.count > 0 && data.type !== undefined) {
        inventory.setStack(i, new ItemStack(data.id,data.type,data.count,data.metadata??0,data.damage??0));
      } else {
        inventory.setStack(i, null);
      }
    }
  }
}
