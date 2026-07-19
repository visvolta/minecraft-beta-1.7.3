import type { InventoryController } from './InventoryController';
import type { HotbarLayout } from './HotbarLayout';

/**
 * Manages keyboard and toggle inputs for opening/closing the modal inventory window (`E` and `Escape`),
 * plus hotbar number key (`1-9`) slot swaps when hovered over an inventory slot.
 */
export class InventoryInputController {
  private keydownHandler = (e: KeyboardEvent) => this.handleKeyDown(e);

  public constructor(
    private readonly inventoryController: InventoryController,
    private readonly layout: HotbarLayout,
    attachListener = false
  ) {
    if (attachListener && typeof window !== 'undefined') {
      window.addEventListener('keydown', this.keydownHandler);
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.code === 'KeyE') {
      e.preventDefault();
      this.inventoryController.toggle(this.layout.scale);
      return;
    }

    if (e.code === 'Escape' && this.inventoryController.isOpen) {
      e.preventDefault();
      e.stopPropagation();
      this.inventoryController.close();
      return;
    }

    if (this.inventoryController.isOpen && e.code.startsWith('Digit')) {
      const digit = Number(e.code.replace('Digit', ''));
      if (digit >= 1 && digit <= 9) {
        e.preventDefault();
        this.inventoryController.handleNumberKey(digit);
      }
    }
  }

  public dispose(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.keydownHandler);
    }
  }
}
