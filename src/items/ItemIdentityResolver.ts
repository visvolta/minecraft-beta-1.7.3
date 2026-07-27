import { DEFAULT_ITEM_DEFINITIONS } from './ItemDefinitionRegistry';
import type { ItemIdentity } from '../inventory/ItemStack';

export interface CanonicalIdentity {
  readonly type: 'block' | 'item';
  readonly id: string | number;
}

/**
 * Registry-backed identity normalization for gameplay matching.
 *
 * Saves and UI can address items by either Beta numeric ids or project string
 * ids. Recipes/fuels/smelting must not care which spelling a stack came from,
 * so item identities normalize through ItemDefinitionRegistry. Block ids remain
 * numeric Beta/project block ids.
 */
export function canonicalIdentity(identity: ItemIdentity | { readonly id: string | number; readonly type?: 'block' | 'item' }): CanonicalIdentity {
  const type = identity.type ?? 'item';
  if (type === 'block') {
    const numeric = Number(identity.id);
    return { type: 'block', id: Number.isInteger(numeric) ? numeric : identity.id };
  }
  const definition = DEFAULT_ITEM_DEFINITIONS.get(identity.id);
  return { type: 'item', id: definition?.id ?? identity.id };
}

export function idsMatch(stack: ItemIdentity, ingredientId: string | number): boolean {
  const stackCanonical = canonicalIdentity(stack);
  if (stackCanonical.type === 'block') {
    const ingNumeric = Number(ingredientId);
    if (Number.isInteger(ingNumeric)) return stackCanonical.id === ingNumeric;
    return String(stackCanonical.id) === String(ingredientId);
  }
  const ingredientCanonical = canonicalIdentity({ id: ingredientId, type: 'item' });
  return stackCanonical.type === ingredientCanonical.type && String(stackCanonical.id) === String(ingredientCanonical.id);
}

export function itemIdsMatch(a: string | number, b: string | number): boolean {
  const ca = canonicalIdentity({ id: a, type: 'item' });
  const cb = canonicalIdentity({ id: b, type: 'item' });
  return String(ca.id) === String(cb.id);
}
