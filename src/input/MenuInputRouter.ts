import type { InventoryController } from '../inventory/InventoryController';
import type { CraftingTableController } from '../crafting/CraftingTableController';
import type { FurnaceController } from '../furnace/FurnaceController';
import type { HotbarLayout } from '../inventory/HotbarLayout';

/**
 * Single authoritative menu-input routing path (`Use one authoritative menu-input routing path`).
 * Prevents duplicate key listeners and ensures only one modal menu is open at a time (`ensure only one modal menu can be open at a time; avoid duplicate key listeners`).
 */
export class MenuInputRouter {
  private readonly keydownHandler = (e: KeyboardEvent) => this.handleKeyDown(e);

  public constructor(
    private readonly inventoryController: InventoryController,
    private readonly craftingTableController: CraftingTableController,
    private readonly furnaceController: FurnaceController,
    private readonly layout: HotbarLayout
  ) {
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.keydownHandler);
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.code === 'KeyE') {
      e.preventDefault();
      e.stopImmediatePropagation();

      if (this.furnaceController.isOpen) {
        this.furnaceController.updateScale(this.layout.scale);
        this.furnaceController.close();
        return;
      }

      if (this.craftingTableController.isOpen) {
        this.craftingTableController.updateScale(this.layout.scale);
        this.craftingTableController.close();
        return;
      }

      if (this.inventoryController.isOpen) {
        this.inventoryController.updateScale(this.layout.scale);
        this.inventoryController.close();
        return;
      }

      this.inventoryController.open(this.layout.scale);
      return;
    }

    if (e.code === 'Escape') {
      if (this.furnaceController.isOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.furnaceController.updateScale(this.layout.scale);
        this.furnaceController.close();
        return;
      }
      if (this.craftingTableController.isOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.craftingTableController.updateScale(this.layout.scale);
        this.craftingTableController.close();
        return;
      }
      if (this.inventoryController.isOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.inventoryController.updateScale(this.layout.scale);
        this.inventoryController.close();
        return;
      }
    }

    if (e.code.startsWith('Digit')) {
      const digit = Number(e.code.replace('Digit', ''));
      if (digit >= 1 && digit <= 9) {
        if (this.furnaceController.isOpen) {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.furnaceController.handleNumberKey(digit);
          return;
        }
        if (this.craftingTableController.isOpen) {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.craftingTableController.handleNumberKey(digit);
          return;
        }
        if (this.inventoryController.isOpen) {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.inventoryController.handleNumberKey(digit);
          return;
        }
      }
    }
  }

  public dispose(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.keydownHandler);
    }
  }
}
