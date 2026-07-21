import type { ItemStack } from '../inventory/ItemStack';

export interface ArmourReductionResult {
  readonly healthDamage: number;
  readonly remainder: number;
}

/**
 * Beta InventoryPlayer.getTotalArmorValue(): protection decays with the
 * combined remaining durability of all equipped pieces.
 */
export function calculateDurabilityWeightedArmourValue(stacks: readonly (ItemStack | null)[]): number {
  let baseProtection = 0;
  let remainingDurability = 0;
  let maximumDurability = 0;

  for (const stack of stacks) {
    if (stack === null || stack.identity.type !== 'item') continue;
    const definition = stack.getDefinition();
    if (definition?.armourSlot === undefined || definition.protection === undefined) continue;
    const maximum = stack.getMaxDurability();
    if (maximum <= 0 || stack.damage >= maximum) continue;
    baseProtection += definition.protection;
    remainingDurability += maximum - stack.damage;
    maximumDurability += maximum;
  }

  if (maximumDurability === 0) return 0;
  return Math.floor(((baseProtection - 1) * remainingDurability) / maximumDurability) + 1;
}

/** Beta's 25-point integer reduction with a transient fractional remainder. */
export function reduceDamageByArmour(
  acceptedDamage: number,
  armourValue: number,
  previousRemainder: number,
): ArmourReductionResult {
  const incoming = Math.max(0, Math.floor(acceptedDamage));
  const armour = Math.max(0, Math.min(20, Math.floor(armourValue)));
  const scaled = incoming * (25 - armour) + Math.max(0, Math.floor(previousRemainder));
  return {
    healthDamage: Math.floor(scaled / 25),
    remainder: scaled % 25,
  };
}

/** Approved Stage 9E armour wear: one durability per four accepted damage, minimum one. */
export function getArmourDurabilityDamage(acceptedDamage: number): number {
  return Math.max(1, Math.floor(Math.max(0, acceptedDamage) / 4));
}
