import type { CraftingGrid } from './CraftingGrid';
import { ItemStack } from '../inventory/ItemStack';

export interface RecipeIngredient {
  readonly id: string | number;
  readonly metadata?: number | undefined; // -1 or undefined = wildcard metadata matching
}

export interface RecipeConsumption {
  readonly slotIndex: number;
  readonly amount: number;
  readonly containerReturn?: ItemStack | undefined;
}

export interface RecipeMatchResult {
  readonly output: ItemStack;
  readonly consumption: readonly RecipeConsumption[];
}

export interface CraftingRecipe {
  matches(grid: CraftingGrid): RecipeMatchResult | null;
}

/** Helper returning container returns (`Only implement container-item returns for recipes and items that actually exist and are confirmed by Beta 1.7.3`). */
export function getContainerReturn(stack: ItemStack): ItemStack | undefined {
  const idStr = String(stack.identity.id);
  if (
    idStr === 'bucket_milk' ||
    idStr === 'bucket_water' ||
    idStr === 'bucket_lava' ||
    idStr === '326' ||
    idStr === '327' ||
    idStr === '335'
  ) {
    return new ItemStack('bucket_empty', 'item', 1, 0);
  }
  return undefined;
}
