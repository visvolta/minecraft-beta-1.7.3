export const ARMOUR_SLOTS = ['helmet', 'chestplate', 'leggings', 'boots'] as const;

export type ArmourSlot = (typeof ARMOUR_SLOTS)[number];
export type ArmourMaterialId = 'leather' | 'chain' | 'iron' | 'diamond' | 'gold';

export interface ArmourMaterial {
  readonly id: ArmourMaterialId;
  /** Beta ItemArmor armourLevel, used by the durability formula. */
  readonly level: number;
  readonly durability: Readonly<Record<ArmourSlot, number>>;
}

export const ARMOUR_SLOT_PROTECTION: Readonly<Record<ArmourSlot, number>> = {
  helmet: 3,
  chestplate: 8,
  leggings: 6,
  boots: 3,
};

export const ARMOUR_MATERIALS: Readonly<Record<ArmourMaterialId, ArmourMaterial>> = {
  leather: {
    id: 'leather',
    level: 0,
    durability: { helmet: 33, chestplate: 48, leggings: 45, boots: 39 },
  },
  chain: {
    id: 'chain',
    level: 1,
    durability: { helmet: 66, chestplate: 96, leggings: 90, boots: 78 },
  },
  iron: {
    id: 'iron',
    level: 2,
    durability: { helmet: 132, chestplate: 192, leggings: 180, boots: 156 },
  },
  diamond: {
    id: 'diamond',
    level: 3,
    durability: { helmet: 264, chestplate: 384, leggings: 360, boots: 312 },
  },
  gold: {
    id: 'gold',
    level: 1,
    durability: { helmet: 66, chestplate: 96, leggings: 90, boots: 78 },
  },
};

/** Canonical Beta item ids (Item constructor id + 256). */
export const ARMOUR_ITEM_IDS: Readonly<Record<ArmourMaterialId, Readonly<Record<ArmourSlot, number>>>> = {
  leather: { helmet: 298, chestplate: 299, leggings: 300, boots: 301 },
  chain: { helmet: 302, chestplate: 303, leggings: 304, boots: 305 },
  iron: { helmet: 306, chestplate: 307, leggings: 308, boots: 309 },
  diamond: { helmet: 310, chestplate: 311, leggings: 312, boots: 313 },
  gold: { helmet: 314, chestplate: 315, leggings: 316, boots: 317 },
};
