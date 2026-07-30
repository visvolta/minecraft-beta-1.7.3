import { DEFAULT_ITEM_DEFINITIONS } from './ItemDefinitionRegistry';
import type { ItemStack } from '../inventory/ItemStack';

/** Beta bare-hand / non-weapon attack damage (half-hearts). */
export const BARE_HAND_DAMAGE = 1;

/**
 * Beta held-item melee damage (`ItemSword`/`ItemTool` `getDamageVsEntity`),
 * kept strictly separate from projectile damage and from mining speed.
 *
 *   sword   = 4 + combatBonus * 2   (wood/gold 4, stone 6, iron 8, diamond 10)
 *   axe     = 3 + combatBonus       (wood/gold 3, stone 4, iron 5, diamond 6)
 *   pickaxe = 2 + combatBonus       (wood/gold 2, stone 3, iron 4, diamond 5)
 *   shovel  = 1 + combatBonus       (wood/gold 1, stone 2, iron 3, diamond 4)
 *   hoe / hand / anything else = 1
 *
 * `combatBonus` is the tool material's `damageVsEntity` (0/1/2/3/0 for
 * wood/stone/iron/diamond/gold). This is the ONLY place melee damage is
 * resolved so it can never accidentally use mining speed.
 */
export function getMeleeDamage(stack: ItemStack | null): number {
  if (stack === null || stack.identity.type !== 'item') return BARE_HAND_DAMAGE;
  const definition = DEFAULT_ITEM_DEFINITIONS.get(stack.identity.id);
  if (definition === undefined) return BARE_HAND_DAMAGE;
  const bonus = definition.combatBonus ?? 0;
  switch (definition.toolClass) {
    case 'sword': return 4 + bonus * 2;
    case 'axe': return 3 + bonus;
    case 'pickaxe': return 2 + bonus;
    case 'shovel': return 1 + bonus;
    // Hoes and non-tools fight like a bare hand in Beta.
    default: return BARE_HAND_DAMAGE;
  }
}
