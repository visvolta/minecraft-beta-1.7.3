import type { InventoryController } from '../inventory/InventoryController';
import type { CreativeInventoryController } from '../inventory/CreativeInventoryController';
import type { Player } from '../player/Player';
import type { CraftingTableController } from '../crafting/CraftingTableController';
import type { FurnaceController } from '../furnace/FurnaceController';
import type { ChestController } from '../chest/ChestController';
import type { HotbarLayout } from '../inventory/HotbarLayout';

import type { SignController } from '../sign/SignController';
import type { InputAction } from './Input';

/**
 * Single authoritative menu-input routing path (`Use one authoritative menu-input routing path`).
 * Prevents duplicate key listeners and ensures only one modal menu is open at a time (`ensure only one modal menu can be open at a time; avoid duplicate key listeners`).
 */
type InputBindings = Readonly<Record<InputAction, readonly string[]>>;

export class MenuInputRouter {
  private readonly keydownHandler = (e: KeyboardEvent) => this.handleKeyDown(e);

  private readonly creativeInventoryController: CreativeInventoryController | undefined;
  private readonly player: Player | undefined;

  public constructor(
    private readonly inventoryController: InventoryController,
    private readonly craftingTableController: CraftingTableController,
    private readonly furnaceController: FurnaceController,
    private readonly chestController: ChestController,
    private readonly signController: SignController,
    private readonly layout: HotbarLayout,
    creativeInventoryController?: CreativeInventoryController,
    player?: Player,
    private readonly getBindings?: () => InputBindings,
  ) {
    this.creativeInventoryController = creativeInventoryController;
    this.player = player;
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.keydownHandler);
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (this.isAction(e, 'inventory')) {
      if (this.signController.isOpen) return; // Prevent E from closing inventory while typing on a sign

      e.preventDefault();
      e.stopImmediatePropagation();

      if (this.furnaceController.isOpen) {
        this.furnaceController.updateScale(this.layout.scale);
        this.furnaceController.close();
        return;
      }

      if (this.chestController.isOpen) {
        this.chestController.updateScale(this.layout.scale);
        this.chestController.close();
        return;
      }

      if (this.craftingTableController.isOpen) {
        this.craftingTableController.updateScale(this.layout.scale);
        this.craftingTableController.close();
        return;
      }

      if (this.creativeInventoryController?.isOpen === true) {
        this.creativeInventoryController.close();
        return;
      }

      if (this.inventoryController.isOpen) {
        this.inventoryController.updateScale(this.layout.scale);
        this.inventoryController.close();
        return;
      }

      if (this.player?.isCreativeMode() === true && this.creativeInventoryController !== undefined) this.creativeInventoryController.open(this.layout.scale);
      else this.inventoryController.open(this.layout.scale);
      return;
    }

    if (this.isAction(e, 'pause')) {
      if (this.signController.isOpen) {
        // Handled directly inside SignUi (it restores/cancels and closes).
        // But we return here so it doesn't propagate to pausing the game.
        return;
      }
      if (this.furnaceController.isOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.furnaceController.updateScale(this.layout.scale);
        this.furnaceController.close();
        return;
      }
      if (this.chestController.isOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.chestController.updateScale(this.layout.scale);
        this.chestController.close();
        return;
      }
      if (this.craftingTableController.isOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.craftingTableController.updateScale(this.layout.scale);
        this.craftingTableController.close();
        return;
      }
      if (this.creativeInventoryController?.isOpen === true) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.creativeInventoryController.close();
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
        if (this.chestController.isOpen) {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.chestController.handleNumberKey(digit);
          return;
        }
        if (this.craftingTableController.isOpen) {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.craftingTableController.handleNumberKey(digit);
          return;
        }
        if (this.creativeInventoryController?.isOpen === true) {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.inventoryController.handleNumberKey(digit);
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

  private isAction(event: KeyboardEvent, action: InputAction): boolean {
    const bindings = this.getBindings?.();
    if (bindings !== undefined) return bindings[action].includes(event.code);
    if (action === 'inventory') return event.code === 'KeyE';
    if (action === 'pause') return event.code === 'Escape';
    return false;
  }

  public dispose(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.keydownHandler);
    }
  }
}
