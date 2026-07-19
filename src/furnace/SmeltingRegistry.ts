import type { ItemStack } from '../inventory/ItemStack';
import type { SmeltingRecipe } from './SmeltingRecipe';

/**
 * Authoritative smelting recipe registry (`deterministic lookup; no recipe checks hardcoded inside the UI`).
 */
export class SmeltingRegistry {
  private readonly recipes: SmeltingRecipe[] = [];

  public register(recipe: SmeltingRecipe): void {
    this.recipes.push(recipe);
  }

  public getRecipe(stack: ItemStack | null): SmeltingRecipe | undefined {
    if (stack === null || stack.count <= 0) return undefined;
    for (const recipe of this.recipes) {
      if (recipe.matches(stack)) {
        return recipe;
      }
    }
    return undefined;
  }

  public getRecipes(): ReadonlyArray<SmeltingRecipe> {
    return this.recipes;
  }

  public clear(): void {
    this.recipes.length = 0;
  }

  public get size(): number {
    return this.recipes.length;
  }
}
