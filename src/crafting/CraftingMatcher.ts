import type { CraftingGrid } from './CraftingGrid';
import type { RecipeMatchResult } from './CraftingRecipe';
import type { RecipeRegistry } from './RecipeRegistry';

export class CraftingMatcher {
  public static findMatchingRecipe(grid: CraftingGrid, registry: RecipeRegistry): RecipeMatchResult | null {
    if (grid.isEmpty()) return null;

    for (const recipe of registry.getRecipes()) {
      const match = recipe.matches(grid);
      if (match) {
        return match;
      }
    }

    return null;
  }
}
