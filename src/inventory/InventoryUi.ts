import { ARMOUR_SLOTS } from '../items/ArmourMaterial';
import type { ItemStack } from './ItemStack';
import type { SlotContentRenderer } from './SlotContentRenderer';

/**
 * Modal player inventory UI window (176x166 texture `inventory_menu.png`).
 * Manages all 36 player slots, 4 2x2 crafting input slots, and 1 crafting result slot.
 */
export class InventoryUi {
  readonly root = typeof document !== 'undefined' ? document.createElement('div') : ({} as any);
  private windowEl = typeof document !== 'undefined' ? document.createElement('div') : ({} as any);
  private highlightEl = typeof document !== 'undefined' ? document.createElement('div') : ({} as any);
  private slots: HTMLDivElement[] = [];
  private equipmentSlots: HTMLDivElement[] = [];
  private craftingSlots: HTMLDivElement[] = [];
  private resultSlotEl = typeof document !== 'undefined' ? document.createElement('div') : ({} as any);

  public constructor() {
    if (typeof document === 'undefined') return;
    this.root.id = 'inventory-modal-root';
    this.root.style.position = 'fixed';
    this.root.style.inset = '0';
    this.root.style.zIndex = '1000';
    this.root.style.background = 'rgba(0, 0, 0, 0.4)';
    this.root.style.display = 'none';
    this.root.style.pointerEvents = 'auto';
    this.root.style.userSelect = 'none';

    this.windowEl.className = 'inventory-window';
    this.windowEl.style.position = 'absolute';
    this.windowEl.style.top = '50%';
    this.windowEl.style.left = '50%';
    this.windowEl.style.transform = 'translate(-50%, -50%)';
    this.windowEl.style.background = "url('/textures/gui/inventory_menu.png') center / 100% 100% no-repeat";
    this.windowEl.style.imageRendering = 'pixelated';

    this.highlightEl.className = 'inventory-slot-highlight';
    this.highlightEl.style.position = 'absolute';
    this.highlightEl.style.background = "url('/textures/gui/inventory_slothighlight.png') center / 100% 100% no-repeat";
    this.highlightEl.style.imageRendering = 'pixelated';
    this.highlightEl.style.pointerEvents = 'none';
    this.highlightEl.style.zIndex = '5';
    this.highlightEl.style.display = 'none';
    this.windowEl.appendChild(this.highlightEl);

    // Player slots 0..35
    for (let i = 0; i < 36; i++) {
      const e = this.createSlotElement(`player-${i}`, String(i));
      this.windowEl.appendChild(e);
      this.slots.push(e);
    }

    // Dedicated Beta equipment slots, top-to-bottom: helmet, chestplate, leggings, boots.
    for (const slot of ARMOUR_SLOTS) {
      const e = this.createSlotElement(`armour-${slot}`, slot);
      e.dataset.equipmentSlot = slot;
      this.windowEl.appendChild(e);
      this.equipmentSlots.push(e);
    }

    // 2x2 Crafting input slots 0..3
    for (let i = 0; i < 4; i++) {
      const e = this.createSlotElement(`crafting-${i}`, String(i));
      this.windowEl.appendChild(e);
      this.craftingSlots.push(e);
    }

    // Result slot
    this.resultSlotEl = this.createSlotElement('crafting-result', 'result');
    this.windowEl.appendChild(this.resultSlotEl);

    this.root.appendChild(this.windowEl);
    document.body.appendChild(this.root);
  }

  private createSlotElement(idSuffix: string, slotAttr: string): HTMLDivElement {
    const e = document.createElement('div');
    e.className = 'inventory-slot';
    e.id = `inv-slot-${idSuffix}`;
    e.dataset.slot = slotAttr;
    e.style.position = 'absolute';
    e.style.cursor = 'pointer';

    const content = document.createElement('div');
    content.className = 'stage1-slot-content';
    content.style.width = '100%';
    content.style.height = '100%';
    content.style.pointerEvents = 'none';

    const img = document.createElement('img');
    img.className = 'stage1-icon';
    img.draggable = false;

    const count = document.createElement('span');
    count.className = 'stage1-count';

    content.append(img, count);
    e.append(content);
    return e;
  }

  public open(scale: number): void {
    if (typeof document === 'undefined') return;
    this.setScale(scale);
    this.root.style.display = 'block';

    const stage1Hud = document.getElementById('stage1-hud');
    if (stage1Hud) {
      stage1Hud.style.display = 'none';
    }
  }

  public close(): void {
    if (typeof document === 'undefined') return;
    this.root.style.display = 'none';
    this.hideHoverHighlight();

    const stage1Hud = document.getElementById('stage1-hud');
    if (stage1Hud) {
      stage1Hud.style.display = '';
    }
  }

  public setScale(scale: number): void {
    if (typeof document === 'undefined' || !this.windowEl.style) return;
    this.windowEl.style.width = `${176 * scale}px`;
    this.windowEl.style.height = `${166 * scale}px`;
    this.windowEl.style.setProperty('--gui-scale', String(scale));

    // Player slots 0..35
    this.slots.forEach((e, i) => {
      let x = 8;
      let y = 84;
      if (i >= 0 && i <= 8) {
        x = 8 + i * 18;
        y = 142;
      } else {
        const row = Math.floor((i - 9) / 9);
        const col = (i - 9) % 9;
        x = 8 + col * 18;
        y = 84 + row * 18;
      }

      e.style.left = `${x * scale}px`;
      e.style.top = `${y * scale}px`;
      e.style.width = `${16 * scale}px`;
      e.style.height = `${16 * scale}px`;
      e.style.setProperty('--gui-scale', String(scale));
    });

    // Armour slots use the four blank cells already painted into the Beta GUI.
    this.equipmentSlots.forEach((e, i) => {
      e.style.left = `${8 * scale}px`;
      e.style.top = `${(8 + i * 18) * scale}px`;
      e.style.width = `${16 * scale}px`;
      e.style.height = `${16 * scale}px`;
      e.style.setProperty('--gui-scale', String(scale));
    });

    // Crafting input slots 0..3 (2x2 grid)
    this.craftingSlots.forEach((e, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 88 + col * 18;
      const y = 26 + row * 18;

      e.style.left = `${x * scale}px`;
      e.style.top = `${y * scale}px`;
      e.style.width = `${16 * scale}px`;
      e.style.height = `${16 * scale}px`;
      e.style.setProperty('--gui-scale', String(scale));
    });

    // Result slot
    if (this.resultSlotEl && this.resultSlotEl.style) {
      this.resultSlotEl.style.left = `${144 * scale}px`;
      this.resultSlotEl.style.top = `${36 * scale}px`;
      this.resultSlotEl.style.width = `${16 * scale}px`;
      this.resultSlotEl.style.height = `${16 * scale}px`;
      this.resultSlotEl.style.setProperty('--gui-scale', String(scale));
    }

    this.highlightEl.style.width = `${16 * scale}px`;
    this.highlightEl.style.height = `${16 * scale}px`;
  }

  public setHoverHighlightOnElement(el: HTMLElement, _scale = 1): void {
    if (typeof document === 'undefined' || !el || !el.style) {
      this.hideHoverHighlight();
      return;
    }
    const left = el.style.left;
    const top = el.style.top;
    if (left && top) {
      this.highlightEl.style.left = left;
      this.highlightEl.style.top = top;
      this.highlightEl.style.display = 'block';
    }
  }

  public setHoverHighlight(slotIndex: number, scale = 1): void {
    if (slotIndex >= 0 && slotIndex < 36 && this.slots[slotIndex]) {
      this.setHoverHighlightOnElement(this.slots[slotIndex]!, scale);
    } else {
      this.hideHoverHighlight();
    }
  }

  public hideHoverHighlight(): void {
    if (typeof document !== 'undefined' && this.highlightEl.style) {
      this.highlightEl.style.display = 'none';
    }
  }

  public render(
    stacks: readonly (ItemStack | null)[],
    equipmentStacks: readonly (ItemStack | null)[],
    craftingStacks: readonly (ItemStack | null)[],
    resultStack: ItemStack | null,
    renderer: SlotContentRenderer
  ): void {
    if (typeof document === 'undefined') return;
    for (let i = 0; i < 36; i++) {
      const e = this.slots[i];
      if (e) {
        const content = e.querySelector<HTMLElement>('.stage1-slot-content');
        if (content) renderer.renderSlot(content, stacks[i] ?? null);
      }
    }
    for (let i = 0; i < ARMOUR_SLOTS.length; i++) {
      const e = this.equipmentSlots[i];
      if (e) {
        const content = e.querySelector<HTMLElement>('.stage1-slot-content');
        if (content) renderer.renderSlot(content, equipmentStacks[i] ?? null);
      }
    }
    for (let i = 0; i < 4; i++) {
      const e = this.craftingSlots[i];
      if (e) {
        const content = e.querySelector<HTMLElement>('.stage1-slot-content');
        if (content) renderer.renderSlot(content, craftingStacks[i] ?? null);
      }
    }
    if (this.resultSlotEl) {
      const content = (this.resultSlotEl as HTMLElement).querySelector<HTMLElement>('.stage1-slot-content');
      if (content) renderer.renderSlot(content, resultStack);
    }
  }

  public getSlots(): ReadonlyArray<HTMLDivElement> {
    return this.slots;
  }

  public getEquipmentSlots(): ReadonlyArray<HTMLDivElement> {
    return this.equipmentSlots;
  }

  public getCraftingSlots(): ReadonlyArray<HTMLDivElement> {
    return this.craftingSlots;
  }

  public getResultSlot(): HTMLDivElement {
    return this.resultSlotEl;
  }

  public dispose(): void {
    if (typeof document !== 'undefined' && this.root.remove) {
      this.root.remove();
    }
  }
}
