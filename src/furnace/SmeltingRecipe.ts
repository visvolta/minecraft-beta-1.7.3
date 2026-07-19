import type { ItemStack } from '../inventory/ItemStack';

export interface SmeltingRecipeIngredient {
  readonly id: string | number;
  readonly metadata?: number | undefined; // -1 or undefined = wildcard metadata matching
}

/**
 * Authoritative smelting recipe definition (`store the smelt time in each SmeltingRecipe and use that value during processing`).
 */
export class SmeltingRecipe {
  public constructor(
    public readonly input: SmeltingRecipeIngredient,
    public readonly output: ItemStack,
    public readonly duration = 200
  ) {}

  public matches(stack: ItemStack | null): boolean {
    if (stack === null || stack.count <= 0) return false;
    if (String(stack.identity.id) !== String(this.input.id)) return false;
    if (this.input.metadata !== undefined && this.input.metadata !== -1) {
      if (stack.metadata !== this.input.metadata) return false;
    }
    return true;
  }
}
