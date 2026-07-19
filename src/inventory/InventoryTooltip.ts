/**
 * Modal inventory cursor-following tooltip.
 * Displays Beta-style item display names (`displayName`), clamped to viewport.
 */
export class InventoryTooltip {
  private readonly root = typeof document !== 'undefined' ? document.createElement('div') : ({} as any);

  public constructor() {
    if (typeof document === 'undefined') return;
    this.root.id = 'inventory-tooltip';
    this.root.style.position = 'fixed';
    this.root.style.pointerEvents = 'none';
    this.root.style.zIndex = '2000';
    this.root.style.background = 'rgba(16, 0, 16, 0.95)';
    this.root.style.border = '2px solid #360088';
    this.root.style.color = '#fff';
    this.root.style.fontFamily = 'monospace';
    this.root.style.fontWeight = 'bold';
    this.root.style.imageRendering = 'pixelated';
    this.root.style.display = 'none';
    document.body.appendChild(this.root);
  }

  public update(x: number, y: number, text: string | null, scale = 1): void {
    if (typeof document === 'undefined') return;
    if (!text) {
      this.root.style.display = 'none';
      return;
    }

    this.root.textContent = text;
    this.root.style.display = 'block';
    this.root.style.fontSize = `${12 * scale}px`;
    this.root.style.padding = `${4 * scale}px ${6 * scale}px`;

    let left = x + 14 * scale;
    let top = y - 16 * scale;

    const rect = this.root.getBoundingClientRect();
    const winWidth = typeof window !== 'undefined' ? window.innerWidth : 1000;
    const winHeight = typeof window !== 'undefined' ? window.innerHeight : 1000;

    if (left + rect.width > winWidth - 4) {
      left = x - rect.width - 8 * scale;
    }
    if (top < 4) {
      top = y + 16 * scale;
    }
    if (top + rect.height > winHeight - 4) {
      top = winHeight - rect.height - 4;
    }

    this.root.style.left = `${Math.max(4, left)}px`;
    this.root.style.top = `${Math.max(4, top)}px`;
  }

  public dispose(): void {
    if (typeof document !== 'undefined' && this.root.remove) {
      this.root.remove();
    }
  }
}
