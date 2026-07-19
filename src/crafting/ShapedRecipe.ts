import type { CraftingGrid } from './CraftingGrid';
import type { CraftingRecipe, RecipeIngredient, RecipeMatchResult, RecipeConsumption } from './CraftingRecipe';
import { getContainerReturn } from './CraftingRecipe';
import type { ItemStack } from '../inventory/ItemStack';

export class ShapedRecipe implements CraftingRecipe {
  public constructor(
    public readonly width: number,
    public readonly height: number,
    private readonly pattern: readonly (RecipeIngredient | null)[],
    private readonly output: ItemStack,
    private readonly mirrored = true
  ) {}

  public matches(grid: CraftingGrid): RecipeMatchResult | null {
    if (grid.width < this.width || grid.height < this.height) {
      return null;
    }

    for (let startX = 0; startX <= grid.width - this.width; startX++) {
      for (let startY = 0; startY <= grid.height - this.height; startY++) {
        const standardResult = this.checkMatch(grid, startX, startY, false);
        if (standardResult) return standardResult;

        if (this.mirrored && this.width > 1) {
          const mirroredResult = this.checkMatch(grid, startX, startY, true);
          if (mirroredResult) return mirroredResult;
        }
      }
    }

    return null;
  }

  private checkMatch(grid: CraftingGrid, startX: number, startY: number, mirrored: boolean): RecipeMatchResult | null {
    const consumption: RecipeConsumption[] = [];

    for (let gy = 0; gy < grid.height; gy++) {
      for (let gx = 0; gx < grid.width; gx++) {
        const slotIdx = gy * grid.width + gx;
        const stack = grid.getStack(slotIdx);

        const inBoxX = gx >= startX && gx < startX + this.width;
        const inBoxY = gy >= startY && gy < startY + this.height;

        if (!inBoxX || !inBoxY) {
          // Must be empty outside recipe bounding box
          if (stack !== null && stack.count > 0) {
            return null;
          }
          continue;
        }

        const patX = gx - startX;
        const patY = gy - startY;
        const effectiveX = mirrored ? this.width - 1 - patX : patX;
        const patIdx = patY * this.width + effectiveX;
        const ingredient = this.pattern[patIdx] ?? null;

        if (ingredient === null) {
          if (stack !== null && stack.count > 0) {
            return null;
          }
          continue;
        }

        if (stack === null || stack.count <= 0) {
          return null;
        }

        // Check ID match (`match primarily by id with wildcard/optional metadata -1 support as approved`)
        const stackIdStr = String(stack.identity.id);
        const ingIdStr = String(ingredient.id);
        if (stackIdStr !== ingIdStr) {
          return null;
        }

        if (ingredient.metadata !== undefined && ingredient.metadata !== -1) {
          if (stack.metadata !== ingredient.metadata) {
            return null;
          }
        }

        consumption.push({
          slotIndex: slotIdx,
          amount: 1,
          containerReturn: getContainerReturn(stack)
        });
      }
    }

    return {
      output: this.output.clone(),
      consumption
    };
  }
}
