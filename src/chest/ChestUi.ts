import type { ItemStack } from '../inventory/ItemStack';
import type { SlotContentRenderer } from '../inventory/SlotContentRenderer';
import type { Inventory } from '../inventory/Inventory';

/**
 * Modal chest UI window (single_chestmenu.png).
 * Manages 27 chest slots (0-26) and 36 player inventory slots (27-62).
 */
export class ChestUi {
  readonly root = typeof document !== 'undefined' ? document.createElement('div') : ({} as any);
  private windowEl = typeof document !== 'undefined' ? document.createElement('div') : ({} as any);
  private highlightEl = typeof document !== 'undefined' ? document.createElement('div') : ({} as any);
  private slots: HTMLDivElement[] = [];
  
  private onSlotClick?: (slotIndex: number, e: MouseEvent) => void;
  private onSlotHover?: (slotIndex: number) => void;
  private onBackgroundClick?: (e: MouseEvent) => void;
  private onDragEnd?: (e: MouseEvent) => void;

  private currentScale = 1;

  public constructor() {
    if (typeof document === 'undefined') return;
    this.root.id = 'chest-modal-root';
    this.root.style.position = 'fixed';
    this.root.style.inset = '0';
    this.root.style.zIndex = '1000';
    this.root.style.background = 'rgba(0, 0, 0, 0.4)';
    this.root.style.display = 'none';
    this.root.style.pointerEvents = 'auto';
    this.root.style.userSelect = 'none';

    this.windowEl.className = 'chest-window';
    this.windowEl.style.position = 'absolute';
    this.windowEl.style.left = '50%';
    this.windowEl.style.top = '50%';
    this.windowEl.style.transform = 'translate(-50%, -50%)';
    this.windowEl.style.backgroundImage = 'url(/textures/gui/single_chestmenu.png)';
    // Assets provided indicate dimensions are 175x167 according to previous outputs
    this.windowEl.style.backgroundSize = '100% 100%';
    this.windowEl.style.backgroundRepeat = 'no-repeat';
    this.windowEl.style.imageRendering = 'pixelated';

    this.highlightEl.className = 'slot-highlight';
    this.highlightEl.style.position = 'absolute';
    this.highlightEl.style.backgroundColor = 'rgba(255, 255, 255, 0.4)';
    this.highlightEl.style.display = 'none';
    this.highlightEl.style.pointerEvents = 'none';
    this.highlightEl.style.zIndex = '1';

    this.windowEl.appendChild(this.highlightEl);
    this.root.appendChild(this.windowEl);
    document.body.appendChild(this.root);

    this.root.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.target === this.root) {
        this.onBackgroundClick?.(e);
      }
    });

    this.root.addEventListener('mouseup', (e: MouseEvent) => {
      this.onDragEnd?.(e);
    });

    this.root.addEventListener('mouseleave', () => {
      this.highlightEl.style.display = 'none';
      this.onSlotHover?.(-1); // Or handle clear
    });

    this.createSlots();
  }

  private createSlots(): void {
    if (typeof document === 'undefined') return;

    // Based on visual layout logic of 175x167:
    // Single Chest slots (27): 9 cols x 3 rows. Offset top ~17, left ~7
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 9; col++) {
        const slotIdx = row * 9 + col;
        this.addSlotEl(slotIdx, 8 + col * 18, 18 + row * 18);
      }
    }

    // Double Chest extra slots (27): 9 cols x 3 rows.
    for (let row = 3; row < 6; row++) {
      for (let col = 0; col < 9; col++) {
        const slotIdx = row * 9 + col;
        this.addSlotEl(slotIdx, 8 + col * 18, 18 + row * 18);
      }
    }

    // Player Inventory (27 main) + Hotbar (9). We allocate them up to index 89.
    // They will need to move dynamically.
    for (let i = 0; i < 36; i++) {
      const slotIdx = 54 + i;
      this.addSlotEl(slotIdx, 0, 0); // Will position dynamically
    }
  }

  private addSlotEl(index: number, x: number, y: number): void {
    const el = document.createElement('div');
    el.className = 'chest-slot';
    el.style.position = 'absolute';
    el.dataset.index = index.toString();
    el.dataset.x = x.toString();
    el.dataset.y = y.toString();

    el.addEventListener('mousedown', (e) => this.onSlotClick?.(index, e));
    el.addEventListener('mouseenter', () => {
      this.highlightEl.style.display = 'block';
      const currentX = Number(el.dataset.x);
      const currentY = Number(el.dataset.y);
      this.highlightEl.style.left = `${currentX * this.currentScale}px`;
      this.highlightEl.style.top = `${currentY * this.currentScale}px`;
      this.onSlotHover?.(index);
    });
    el.addEventListener('mouseleave', () => {
      this.highlightEl.style.display = 'none';
      this.onSlotHover?.(-1);
    });
    // Prevent dragging the image elements that get created inside
    el.addEventListener('dragstart', (e) => e.preventDefault());

    this.slots[index] = el;
    this.windowEl.appendChild(el);
  }

  public setOnSlotClick(cb: (slotIndex: number, e: MouseEvent) => void): void { this.onSlotClick = cb; }
  public setOnSlotHover(cb: (slotIndex: number) => void): void { this.onSlotHover = cb; }
  public setOnBackgroundClick(cb: (e: MouseEvent) => void): void { this.onBackgroundClick = cb; }
  public setOnDragEnd(cb: (e: MouseEvent) => void): void { this.onDragEnd = cb; }

  public show(scale: number, isDouble: boolean): void {
    if (typeof document === 'undefined') return;
    this.windowEl.style.backgroundImage = isDouble 
      ? 'url(/textures/gui/doublechest_menu.png)' 
      : 'url(/textures/gui/single_chestmenu.png)';
    
    // Hide extra chest slots if single
    for (let i = 27; i < 54; i++) {
      if (this.slots[i]) this.slots[i]!.style.display = isDouble ? 'block' : 'none';
    }

    this.updateScale(scale, isDouble);
    this.root.style.display = 'block';
  }

  public hide(): void {
    if (typeof document === 'undefined') return;
    this.root.style.display = 'none';
  }

  public updateScale(scale: number, isDouble: boolean): void {
    this.currentScale = scale;
    
    const height = isDouble ? 221 : 167; // Assuming 221 from typical assets (167 + 3*18)
    this.windowEl.style.width = `${175 * scale}px`;
    this.windowEl.style.height = `${height * scale}px`;
    this.windowEl.style.setProperty('--gui-scale', String(scale));

    this.highlightEl.style.width = `${16 * scale}px`;
    this.highlightEl.style.height = `${16 * scale}px`;

    const playerInvOffset = isDouble ? 138 : 84; 
    const hotbarOffset = isDouble ? 196 : 142;

    for (let i = 0; i < 90; i++) {
      const el = this.slots[i];
      if (!el) continue;

      let x = 0;
      let y = 0;

      if (i < 54) {
        // Chest slots (static layout)
        x = Number(el.dataset.x);
        y = Number(el.dataset.y);
      } else {
        // Player Inventory
        const invIdx = i - 54; // 0-35
        if (invIdx < 9) {
          // Hotbar
          x = 8 + invIdx * 18;
          y = hotbarOffset;
        } else {
          // Main
          const mainIdx = invIdx - 9;
          const row = Math.floor(mainIdx / 9);
          const col = mainIdx % 9;
          x = 8 + col * 18;
          y = playerInvOffset + row * 18;
        }
        // Update dataset for mouse events
        el.dataset.x = x.toString();
        el.dataset.y = y.toString();
      }

      el.style.left = `${x * scale}px`;
      el.style.top = `${y * scale}px`;
      el.style.width = `${16 * scale}px`;
      el.style.height = `${16 * scale}px`;
    }
  }

  public getCurrentScale(): number {
    return this.currentScale;
  }

  public getSlotElement(index: number): HTMLDivElement | null {
    return this.slots[index] ?? null;
  }

  public renderInventories(
    activeInventory: Inventory,
    inventory: Inventory,
    contentRenderer: SlotContentRenderer,
    isDouble: boolean
  ): void {
    if (typeof document === 'undefined') return;

    const chestSize = isDouble ? 54 : 27;

    for (let i = 0; i < chestSize; i++) {
      const s = activeInventory.getStack(i);
      this.renderSlot(i, s, contentRenderer);
    }

    for (let i = 0; i < 36; i++) {
      const s = inventory.getStack(i);
      this.renderSlot(54 + i, s, contentRenderer);
    }
  }

  private renderSlot(index: number, stack: ItemStack | null, contentRenderer: SlotContentRenderer): void {
    const el = this.slots[index];
    if (!el) return;
    
    let content = el.querySelector<HTMLElement>('.stage1-slot-content');
    if (!content) {
      content = document.createElement('div');
      content.className = 'stage1-slot-content';
      content.style.width = '100%';
      content.style.height = '100%';

      const img = document.createElement('img');
      img.className = 'stage1-icon';
      img.draggable = false;

      const count = document.createElement('span');
      count.className = 'stage1-count';

      content.append(img, count);
      el.appendChild(content);
    }
    
    contentRenderer.renderSlot(content, stack);
  }
}
