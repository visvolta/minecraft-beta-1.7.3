import type { ItemStack } from '../inventory/ItemStack';
import type { SlotContentRenderer } from '../inventory/SlotContentRenderer';

/**
 * Beta `GuiDispenser` / `ContainerDispenser`.
 *
 * Slot geometry taken verbatim from `ContainerDispenser`:
 *   dispenser 3×3 : x = 62 + col * 18, y = 17 + row * 18
 *   player main   : x =  8 + col * 18, y = 84 + row * 18
 *   hotbar        : x =  8 + col * 18, y = 142
 *
 * Slot indices: 0-8 dispenser, 9-35 player main, 36-44 hotbar.
 * Background is `dispenser.png` (176×166).
 */

/** Beta window size for the dispenser GUI. */
const WINDOW_W = 176;
const WINDOW_H = 166;
const SLOT_SIZE = 18;

export const DISPENSER_SLOT_COUNT = 9;
export const DISPENSER_TOTAL_SLOTS = 45;

export class DispenserUi {
  public readonly root = typeof document !== 'undefined' ? document.createElement('div') : ({} as HTMLDivElement);
  private readonly windowEl = typeof document !== 'undefined' ? document.createElement('div') : ({} as HTMLDivElement);
  private readonly highlightEl = typeof document !== 'undefined' ? document.createElement('div') : ({} as HTMLDivElement);
  private readonly slots: HTMLDivElement[] = [];
  private currentScale = 1;

  private onSlotClick?: (slotIndex: number, event: MouseEvent) => void;
  private onSlotHover?: (slotIndex: number) => void;
  private onBackgroundClick?: (event: MouseEvent) => void;

  public constructor(private readonly slotRenderer: SlotContentRenderer) {
    if (typeof document === 'undefined') return;

    this.root.id = 'dispenser-modal-root';
    this.root.style.cssText = 'position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,0.4);display:none;pointer-events:auto;user-select:none';

    this.windowEl.style.cssText = [
      'position:absolute', 'left:50%', 'top:50%', 'transform:translate(-50%,-50%)',
      "background-image:url('/textures/gui/dispenser.png')",
      'background-size:100% 100%', 'background-repeat:no-repeat', 'image-rendering:pixelated',
    ].join(';');

    this.highlightEl.style.cssText = 'position:absolute;background:rgba(255,255,255,0.4);display:none;pointer-events:none;z-index:1';
    this.windowEl.appendChild(this.highlightEl);
    this.root.appendChild(this.windowEl);
    document.body.appendChild(this.root);

    this.root.addEventListener('mousedown', (event) => {
      if (event.target === this.root) this.onBackgroundClick?.(event);
    });

    this.createSlots();
  }

  private createSlots(): void {
    // Dispenser 3×3 grid.
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        this.addSlot(row * 3 + col, 62 + col * SLOT_SIZE, 17 + row * SLOT_SIZE);
      }
    }
    // Player main inventory (3 rows of 9).
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 9; col++) {
        this.addSlot(DISPENSER_SLOT_COUNT + row * 9 + col, 8 + col * SLOT_SIZE, 84 + row * SLOT_SIZE);
      }
    }
    // Hotbar.
    for (let col = 0; col < 9; col++) {
      this.addSlot(36 + col, 8 + col * SLOT_SIZE, 142);
    }
  }

  private addSlot(index: number, x: number, y: number): void {
    const el = document.createElement('div');
    el.className = 'dispenser-slot';
    el.style.position = 'absolute';
    el.dataset.index = String(index);
    el.dataset.x = String(x);
    el.dataset.y = String(y);

    const icon = document.createElement('img');
    icon.className = 'stage1-icon';
    icon.style.cssText = 'position:absolute;image-rendering:pixelated;pointer-events:none';
    const count = document.createElement('span');
    count.className = 'stage1-count';
    count.style.cssText = 'position:absolute;pointer-events:none;color:white;font-family:Minecraft;text-shadow:1px 1px #3f3f3f';
    el.append(icon, count);

    el.addEventListener('mousedown', (event) => this.onSlotClick?.(index, event));
    el.addEventListener('mouseenter', () => {
      this.highlightEl.style.display = 'block';
      this.highlightEl.style.left = `${x * this.currentScale}px`;
      this.highlightEl.style.top = `${y * this.currentScale}px`;
      this.highlightEl.style.width = `${16 * this.currentScale}px`;
      this.highlightEl.style.height = `${16 * this.currentScale}px`;
      this.onSlotHover?.(index);
    });
    el.addEventListener('mouseleave', () => {
      this.highlightEl.style.display = 'none';
      this.onSlotHover?.(-1);
    });
    el.addEventListener('dragstart', (event) => event.preventDefault());

    this.slots[index] = el;
    this.windowEl.appendChild(el);
  }

  public setOnSlotClick(cb: (slotIndex: number, event: MouseEvent) => void): void { this.onSlotClick = cb; }
  public setOnSlotHover(cb: (slotIndex: number) => void): void { this.onSlotHover = cb; }
  public setOnBackgroundClick(cb: (event: MouseEvent) => void): void { this.onBackgroundClick = cb; }

  public open(scale: number): void {
    if (typeof document === 'undefined') return;
    this.currentScale = scale;
    this.windowEl.style.width = `${WINDOW_W * scale}px`;
    this.windowEl.style.height = `${WINDOW_H * scale}px`;
    for (const el of this.slots) {
      if (el === undefined) continue;
      const x = Number(el.dataset.x), y = Number(el.dataset.y);
      el.style.left = `${x * scale}px`;
      el.style.top = `${y * scale}px`;
      el.style.width = `${16 * scale}px`;
      el.style.height = `${16 * scale}px`;
      const icon = el.querySelector<HTMLImageElement>('.stage1-icon');
      if (icon !== null) { icon.style.width = `${16 * scale}px`; icon.style.height = `${16 * scale}px`; }
      const count = el.querySelector<HTMLSpanElement>('.stage1-count');
      if (count !== null) {
        count.style.fontSize = `${8 * scale}px`;
        count.style.right = `${1 * scale}px`;
        count.style.bottom = `${0 * scale}px`;
      }
    }
    this.root.style.display = 'block';
  }

  public close(): void {
    if (typeof document === 'undefined') return;
    this.root.style.display = 'none';
    this.highlightEl.style.display = 'none';
  }

  public getCurrentScale(): number { return this.currentScale; }

  /** Paints every slot from the supplied stack accessor. */
  public render(getStack: (index: number) => ItemStack | null): void {
    if (typeof document === 'undefined') return;
    for (let i = 0; i < this.slots.length; i++) {
      const el = this.slots[i];
      if (el === undefined) continue;
      this.slotRenderer.renderSlot(el, getStack(i));
    }
  }

  public dispose(): void { this.root.remove?.(); }
}
