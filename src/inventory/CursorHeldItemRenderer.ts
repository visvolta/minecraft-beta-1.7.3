import type { ItemStack } from './ItemStack';
import type { SlotContentRenderer } from './SlotContentRenderer';

/**
 * Renders the held cursor stack (`cursorStack`) following the mouse pointer while the modal inventory is open.
 */
export class CursorHeldItemRenderer {
  private readonly root = typeof document !== 'undefined' ? document.createElement('div') : ({} as any);

  public constructor() {
    if (typeof document === 'undefined') return;
    this.root.id = 'cursor-held-item';
    this.root.style.position = 'fixed';
    this.root.style.pointerEvents = 'none';
    this.root.style.zIndex = '1500';
    this.root.style.display = 'none';

    const content = document.createElement('div');
    content.className = 'stage1-slot-content';
    content.style.width = '100%';
    content.style.height = '100%';

    const img = document.createElement('img');
    img.className = 'stage1-icon';
    img.draggable = false;

    const count = document.createElement('span');
    count.className = 'stage1-count';

    content.append(img, count);
    this.root.append(content);
    document.body.appendChild(this.root);
  }

  public update(x: number, y: number, stack: ItemStack | null, slotContentRenderer?: SlotContentRenderer, scale = 1): void {
    if (typeof document !== 'undefined' && !this.root.style) return;
    if (stack === null || !slotContentRenderer) {
      this.root.style.display = 'none';
      return;
    }

    this.root.style.display = 'block';
    this.root.style.width = `${16 * scale}px`;
    this.root.style.height = `${16 * scale}px`;
    this.root.style.setProperty('--gui-scale', String(scale));
    this.root.style.left = `${x - (8 * scale)}px`;
    this.root.style.top = `${y - (8 * scale)}px`;

    const content = (this.root as HTMLElement).querySelector<HTMLElement>('.stage1-slot-content');
    if (content) {
      slotContentRenderer.renderSlot(content, stack);
    }
  }

  public dispose(): void {
    if (typeof document !== 'undefined' && this.root.remove) {
      this.root.remove();
    }
  }
}
