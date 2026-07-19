import type { FurnaceController } from './FurnaceController';
import type { HotbarLayout } from '../inventory/HotbarLayout';

/**
 * Manages keyboard inputs (`E`, `Escape`, and `1-9`) while the modal furnace window (`176x166`) is open.
 */
export class FurnaceInputController {
  private keydownHandler = (e: KeyboardEvent) => this.handleKeyDown(e);

  public constructor(
    private readonly furnaceController: FurnaceController,
    private readonly layout: HotbarLayout,
    attachListener = false
  ) {
    if (attachListener && typeof window !== 'undefined') {
      window.addEventListener('keydown', this.keydownHandler);
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.furnaceController.isOpen) return;

    if (e.code === 'KeyE' || e.code === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.furnaceController.updateScale(this.layout.scale);
      this.furnaceController.close();
      return;
    }

    if (e.code.startsWith('Digit')) {
      const digit = Number(e.code.replace('Digit', ''));
      if (digit >= 1 && digit <= 9) {
        e.preventDefault();
        this.furnaceController.handleNumberKey(digit);
      }
    }
  }

  public dispose(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.keydownHandler);
    }
  }
}
