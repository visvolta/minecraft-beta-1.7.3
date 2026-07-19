import type { CraftingGrid } from './CraftingGrid';
import type { CraftingRecipe, RecipeIngredient, RecipeMatchResult, RecipeConsumption } from './CraftingRecipe';
import { getContainerReturn } from './CraftingRecipe';
import type { ItemStack } from '../inventory/ItemStack';

export class ShapelessRecipe implements CraftingRecipe {
  public constructor(
    private readonly ingredients: readonly RecipeIngredient[],
    private readonly output: ItemStack
  ) {}

  public matches(grid: CraftingGrid): RecipeMatchResult | null {
    const nonEmptySlots: { slotIndex: number; stack: ItemStack }[] = [];
    for (let i = 0; i < grid.width * grid.height; i++) {
      const stack = grid.getStack(i);
      if (stack !== null && stack.count > 0) {
        nonEmptySlots.push({ slotIndex: i, stack });
      }
    }

    if (nonEmptySlots.length !== this.ingredients.length) {
      return null;
    }

    // Backtracking / permutation match between ingredients and nonEmptySlots
    const usedIndices = new Set<number>();
    if (!this.matchPermutation(0, nonEmptySlots, usedIndices)) {
      return null;
    }

    const consumption: RecipeConsumption[] = nonEmptySlots.map((s) => ({
      slotIndex: s.slotIndex,
      amount: 1,
      containerReturn: getContainerReturn(s.stack)
    }));

    return {
      output: this.output.clone(),
      consumption
    };
  }

  private matchPermutation(
    ingIndex: number,
    slots: readonly { slotIndex: number; stack: ItemStack }[],
    usedIndices: Set<number>
  ): boolean {
    if (ingIndex >= this.ingredients.length) {
      return true;
    }

    const ing = this.ingredients[ingIndex]!;
    for (let i = 0; i < slots.length; i++) {
      if (usedIndices.has(i)) continue;

      const stack = slots[i]!.stack;
      if (String(stack.identity.id) !== String(ing.id)) continue;
      if (ing.metadata !== undefined && ing.metadata !== -1 && stack.metadata !== ing.metadata) continue;

      usedIndices.add(i);
      if (this.matchPermutation(ingIndex + 1, slots, usedIndices)) {
        return true;
      }
      usedIndices.delete(i);
    }

    return false;
  }
}
