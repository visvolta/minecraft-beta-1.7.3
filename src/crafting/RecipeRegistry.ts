import type { CraftingRecipe } from './CraftingRecipe';

/**
 * Authoritatively owned recipe registry (`prefer an explicitly owned and injected registry`).
 * Stores all active shaped and shapeless crafting recipes in deterministic registration order.
 */
export class RecipeRegistry {
  private readonly recipes: CraftingRecipe[] = [];

  public register(recipe: CraftingRecipe): void {
    this.recipes.push(recipe);
  }

  public getRecipes(): ReadonlyArray<CraftingRecipe> {
    return this.recipes;
  }

  public clear(): void {
    this.recipes.length = 0;
  }

  public get size(): number {
    return this.recipes.length;
  }
}
