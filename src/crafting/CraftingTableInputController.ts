import type { CraftingTableController } from './CraftingTableController';
import type { HotbarLayout } from '../inventory/HotbarLayout';

/**
 * Manages keyboard inputs (`E`, `Escape`, and `1-9`) while the modal crafting table window (`176x166`) is open.
 */
export class CraftingTableInputController {
  private keydownHandler = (e: KeyboardEvent) => this.handleKeyDown(e);

  public constructor(
    private readonly tableController: CraftingTableController,
    private readonly layout: HotbarLayout,
    attachListener = false
  ) {
    if (attachListener && typeof window !== 'undefined') {
      window.addEventListener('keydown', this.keydownHandler);
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.tableController.isOpen) return;

    if (e.code === 'KeyE' || e.code === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.tableController.updateScale(this.layout.scale);
      this.tableController.close();
      return;
    }

    if (e.code.startsWith('Digit')) {
      const digit = Number(e.code.replace('Digit', ''));
      if (digit >= 1 && digit <= 9) {
        e.preventDefault();
        this.tableController.handleNumberKey(digit);
      }
    }
  }

  public dispose(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.keydownHandler);
    }
  }
}
