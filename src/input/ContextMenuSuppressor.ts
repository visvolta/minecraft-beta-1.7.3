/**
 * Disables the browser's right-click context menu throughout the entire active window/game surface (`Suppress the browser context menu on the entire window`).
 * Removes listener cleanly during disposal (`remove the listener cleanly during disposal; avoid duplicate global listeners`).
 */
export class ContextMenuSuppressor {
  private readonly handler = (e: MouseEvent): void => {
    e.preventDefault();
  };

  public constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('contextmenu', this.handler);
    }
  }

  public dispose(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('contextmenu', this.handler);
    }
  }
}
