import { ARMOUR_SLOTS, type ArmourSlot } from '../items/ArmourMaterial';
import { DEFAULT_ITEM_DEFINITIONS } from '../items/ItemDefinitionRegistry';
import type { SerializedItemStack, SerializedPlayerEquipment } from '../persistence/metadata/WorldMetadata';
import { Inventory } from './Inventory';
import { ItemStack } from './ItemStack';

function serializeStack(stack: ItemStack): SerializedItemStack {
  return {
    id: stack.identity.id,
    count: stack.count,
    metadata: stack.metadata,
    damage: stack.damage,
    type: stack.identity.type,
  };
}

function isSerializedStack(value: SerializedItemStack | null | undefined): value is SerializedItemStack {
  return value !== null
    && value !== undefined
    && value.id !== undefined
    && (value.type === 'block' || value.type === 'item')
    && Number.isFinite(value.count)
    && value.count > 0;
}

export class InventorySerializer {
  public static serialize(inventory: Inventory, selectedSlot = 0): {
    inventory: (SerializedItemStack | null)[];
    armour: SerializedPlayerEquipment;
    selectedHotbarSlot: number;
  } {
    const serializedSlots = inventory.getSlots().map((stack) => stack === null ? null : serializeStack(stack));
    const equipment = inventory.getEquipment();
    const armour: SerializedPlayerEquipment = equipment === undefined
      ? {}
      : Object.fromEntries(
          ARMOUR_SLOTS.map((slot) => {
            const stack = equipment.getStack(slot);
            const broken = stack !== null && stack.isDamageable() && stack.damage >= stack.getMaxDurability();
            return [slot, stack === null || stack.count <= 0 || broken ? null : serializeStack(stack)];
          }),
        );

    return { inventory: serializedSlots, armour, selectedHotbarSlot: selectedSlot };
  }

  /** Restores ordinary inventory first, then normalizes optional legacy-safe equipment data. */
  public static deserialize(
    inventory: Inventory,
    serializedInventory?: (SerializedItemStack | null)[],
    serializedArmour?: SerializedPlayerEquipment,
  ): void {
    inventory.clear();

    if (Array.isArray(serializedInventory)) {
      const size = inventory.getSlots().length;
      for (let i = 0; i < Math.min(size, serializedInventory.length); i++) {
        const data = serializedInventory[i];
        if (isSerializedStack(data)) {
          inventory.setStack(i, new ItemStack(data.id, data.type, data.count, data.metadata ?? 0, data.damage ?? 0));
        }
      }
    }

    const equipment = inventory.getEquipment();
    if (equipment === undefined || serializedArmour === undefined || serializedArmour === null) return;

    interface Candidate {
      readonly storedSlot: ArmourSlot;
      readonly targetSlot: ArmourSlot;
      readonly stack: ItemStack;
      readonly extraCount: number;
    }
    const candidates: Candidate[] = [];

    for (const storedSlot of ARMOUR_SLOTS) {
      const data = serializedArmour[storedSlot];
      if (!isSerializedStack(data)) continue;
      const definition = data.type === 'item' ? DEFAULT_ITEM_DEFINITIONS.get(data.id) : undefined;
      const targetSlot = definition?.armourSlot;
      const maximum = definition?.durability ?? 0;
      const rawDamage = Number.isFinite(data.damage) ? Math.max(0, Math.floor(data.damage ?? 0)) : 0;

      // Broken equipment is never resurrected. Non-armour data is recovered to ordinary storage.
      if (targetSlot === undefined || maximum <= 0) {
        inventory.insert(data.type, data.id, data.count, data.metadata ?? 0, rawDamage);
        continue;
      }
      if (rawDamage >= maximum) continue;

      candidates.push({
        storedSlot,
        targetSlot,
        stack: new ItemStack(data.id, data.type, 1, data.metadata ?? 0, rawDamage),
        extraCount: Math.max(0, Math.floor(data.count) - 1),
      });
    }

    // Correctly keyed entries win their own slots before wrong-slot normalization.
    for (const candidate of candidates.filter((entry) => entry.storedSlot === entry.targetSlot)) {
      if (equipment.getStack(candidate.targetSlot) === null) equipment.setStack(candidate.targetSlot, candidate.stack);
      else inventory.insert(
        candidate.stack.identity.type,
        candidate.stack.identity.id,
        1,
        candidate.stack.metadata,
        candidate.stack.damage,
      );
      if (candidate.extraCount > 0) inventory.insert(
        candidate.stack.identity.type,
        candidate.stack.identity.id,
        candidate.extraCount,
        candidate.stack.metadata,
        candidate.stack.damage,
      );
    }

    for (const candidate of candidates.filter((entry) => entry.storedSlot !== entry.targetSlot)) {
      if (equipment.getStack(candidate.targetSlot) === null) equipment.setStack(candidate.targetSlot, candidate.stack);
      else inventory.insert(
        candidate.stack.identity.type,
        candidate.stack.identity.id,
        1,
        candidate.stack.metadata,
        candidate.stack.damage,
      );
      if (candidate.extraCount > 0) inventory.insert(
        candidate.stack.identity.type,
        candidate.stack.identity.id,
        candidate.extraCount,
        candidate.stack.metadata,
        candidate.stack.damage,
      );
    }
  }
}
