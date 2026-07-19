import type { Inventory } from '../inventory/Inventory';
import { ItemStack, getMaxStackSize } from '../inventory/ItemStack';
import type { CraftingGrid } from './CraftingGrid';
import { CraftingMatcher } from './CraftingMatcher';
import type { RecipeRegistry } from './RecipeRegistry';
import type { ItemEntityManager } from '../entities/items/ItemEntityManager';
import type { Player } from '../player/Player';

export class CraftingTransferService {
  public static onGridChanged(grid: CraftingGrid, registry: RecipeRegistry): ItemStack | null {
    const match = CraftingMatcher.findMatchingRecipe(grid, registry);
    return match ? match.output.clone() : null;
  }

  private static canFullyAccept(inventory: Inventory, stack: ItemStack): boolean {
    const maxStack = getMaxStackSize(stack.identity);
    let space = 0;
    for (let i = 0; i < 36; i++) {
      const s = inventory.getStack(i);
      if (s === null) {
        space += maxStack;
      } else if (s.matches(stack)) {
        space += Math.max(0, maxStack - s.count);
      }
      if (space >= stack.count) return true;
    }
    return false;
  }

  /**
   * Transactional crafting (`verify the entire output can be accepted before consuming ingredients`).
   * Handles normal clicks (to cursor) and shift-clicks (batch craft up to capacity).
   */
  public static onClickResultSlot(
    inventory: Inventory,
    grid: CraftingGrid,
    resultSlotStack: ItemStack | null,
    cursorStack: ItemStack | null,
    isShiftClick: boolean,
    itemEntityManager: ItemEntityManager,
    player: Player,
    registry: RecipeRegistry
  ): { cursorStack: ItemStack | null; resultSlotStack: ItemStack | null } {
    if (!resultSlotStack) {
      return { cursorStack, resultSlotStack };
    }

    if (!isShiftClick) {
      let canAccept = false;
      if (cursorStack === null) {
        canAccept = true;
      } else if (cursorStack.matches(resultSlotStack)) {
        const maxStack = getMaxStackSize(cursorStack.identity);
        if (cursorStack.count + resultSlotStack.count <= maxStack) {
          canAccept = true;
        }
      }

      if (!canAccept) {
        return { cursorStack, resultSlotStack };
      }

      const match = CraftingMatcher.findMatchingRecipe(grid, registry);
      if (!match || !match.output.matches(resultSlotStack)) {
        return { cursorStack, resultSlotStack };
      }

      grid.consumePlan(match, inventory, itemEntityManager, player);
      let newCursor: ItemStack;
      if (cursorStack === null) {
        newCursor = match.output.clone();
      } else {
        newCursor = cursorStack.clone();
        newCursor.count += match.output.count;
      }

      const nextResult = this.onGridChanged(grid, registry);
      return { cursorStack: newCursor, resultSlotStack: nextResult };
    } else {
      // Shift click batch crafting (`Shift-click crafting must repeatedly rematch, check full output capacity, craft one operation and insert the full result until ingredients or space run out`)
      while (true) {
        const match = CraftingMatcher.findMatchingRecipe(grid, registry);
        if (!match) break;

        if (!this.canFullyAccept(inventory, match.output)) {
          break;
        }

        grid.consumePlan(match, inventory, itemEntityManager, player);
        inventory.insert(match.output.identity.type, match.output.identity.id, match.output.count, match.output.metadata);
      }

      const nextResult = this.onGridChanged(grid, registry);
      return { cursorStack, resultSlotStack: nextResult };
    }
  }

  /**
   * When closing the menu (`E` or `Esc`), returns remaining ingredients (`merge into compatible stacks first; use empty slots next; drop only unavoidable overflow; never delete items`).
   */
  public static closeRecovery(
    grid: CraftingGrid,
    inventory: Inventory,
    itemEntityManager: ItemEntityManager,
    player: Player
  ): void {
    const slots = grid.getSlots();
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (s !== null && s !== undefined && s.count > 0) {
        const accepted = inventory.insert(s.identity.type, s.identity.id, s.count, s.metadata);
        s.count -= accepted;
        if (s.count > 0) {
          const eyeY = player.position.y + 1.62;
          itemEntityManager.spawnThrownItem(
            player.position.x,
            eyeY - 0.3,
            player.position.z,
            {
              type: s.identity.type,
              id: s.identity.id,
              count: s.count,
              metadata: s.metadata
            },
            0, 0.2, 0,
            40
          );
        }
      }
    }
    grid.clear();
  }
}
