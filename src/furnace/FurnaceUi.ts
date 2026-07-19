import type { ItemStack } from '../inventory/ItemStack';
import type { SlotContentRenderer } from '../inventory/SlotContentRenderer';
import type { FurnaceContainer } from './FurnaceContainer';
import type { SmeltingRegistry } from './SmeltingRegistry';

/**
 * Modal furnace UI window (`176x166` `furnace_menu.png`).
 * Manages 3 furnace slots (input 0, fuel 1, output 2), 36 player inventory slots (3-38),
 * plus dynamic flame and arrow progress indicators.
 */
export class FurnaceUi {
  readonly root = typeof document !== 'undefined' ? document.createElement('div') : ({} as any);
  private windowEl = typeof document !== 'undefined' ? document.createElement('div') : ({} as any);
  private highlightEl = typeof document !== 'undefined' ? document.createElement('div') : ({} as any);
  private slots: HTMLDivElement[] = [];
  private flameEl = typeof document !== 'undefined' ? document.createElement('div') : ({} as any);
  private arrowEl = typeof document !== 'undefined' ? document.createElement('div') : ({} as any);

  public constructor() {
    if (typeof document === 'undefined') return;
    this.root.id = 'furnace-modal-root';
    this.root.style.position = 'fixed';
    this.root.style.inset = '0';
    this.root.style.zIndex = '1000';
    this.root.style.background = 'rgba(0, 0, 0, 0.4)';
    this.root.style.display = 'none';
    this.root.style.pointerEvents = 'auto';
    this.root.style.userSelect = 'none';

    this.windowEl.className = 'furnace-window';
    this.windowEl.style.position = 'absolute';
    this.windowEl.style.top = '50%';
    this.windowEl.style.left = '50%';
    this.windowEl.style.transform = 'translate(-50%, -50%)';
    this.windowEl.style.background = "url('/textures/gui/furnace_menu.png') center / 100% 100% no-repeat";
    this.windowEl.style.imageRendering = 'pixelated';

    this.flameEl.className = 'furnace-flame-indicator';
    this.flameEl.style.position = 'absolute';
    this.flameEl.style.background = "url('/textures/gui/furnace_fuelfill.png') bottom left / 100% auto no-repeat";
    this.flameEl.style.imageRendering = 'pixelated';
    this.flameEl.style.pointerEvents = 'none';
    this.flameEl.style.zIndex = '3';
    this.windowEl.appendChild(this.flameEl);

    this.arrowEl.className = 'furnace-arrow-indicator';
    this.arrowEl.style.position = 'absolute';
    this.arrowEl.style.background = "url('/textures/gui/furnace_itemcookprogressarrow.png') top left / auto 100% no-repeat";
    this.arrowEl.style.imageRendering = 'pixelated';
    this.arrowEl.style.pointerEvents = 'none';
    this.arrowEl.style.zIndex = '3';
    this.windowEl.appendChild(this.arrowEl);

    this.highlightEl.className = 'inventory-slot-highlight';
    this.highlightEl.style.position = 'absolute';
    this.highlightEl.style.background = "url('/textures/gui/inventory_slothighlight.png') center / 100% 100% no-repeat";
    this.highlightEl.style.imageRendering = 'pixelated';
    this.highlightEl.style.pointerEvents = 'none';
    this.highlightEl.style.zIndex = '5';
    this.highlightEl.style.display = 'none';
    this.windowEl.appendChild(this.highlightEl);

    // 39 total slots: 0=input, 1=fuel, 2=output, 3..38=player slots (0..35)
    for (let i = 0; i < 39; i++) {
      const e = this.createSlotElement(`furnace-slot-${i}`, String(i));
      this.windowEl.appendChild(e);
      this.slots.push(e);
    }

    this.root.appendChild(this.windowEl);
    document.body.appendChild(this.root);
  }

  private createSlotElement(idSuffix: string, slotAttr: string): HTMLDivElement {
    const e = document.createElement('div');
    e.className = 'inventory-slot';
    e.id = idSuffix;
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
    if (stage1Hud) stage1Hud.style.display = 'none';
  }

  public close(): void {
    if (typeof document === 'undefined') return;
    this.root.style.display = 'none';
    this.hideHoverHighlight();

    const stage1Hud = document.getElementById('stage1-hud');
    if (stage1Hud) stage1Hud.style.display = '';
  }

  public setScale(scale: number): void {
    if (typeof document === 'undefined' || !this.windowEl.style) return;
    this.windowEl.style.width = `${176 * scale}px`;
    this.windowEl.style.height = `${166 * scale}px`;
    this.windowEl.style.setProperty('--gui-scale', String(scale));

    this.slots.forEach((e, i) => {
      let x = 8;
      let y = 84;
      if (i === 0) {
        // Input slot
        x = 56; y = 17;
      } else if (i === 1) {
        // Fuel slot
        x = 56; y = 53;
      } else if (i === 2) {
        // Output slot (`116, 35` inside `24x24` box `112, 31`)
        x = 116; y = 35;
      } else {
        const invIdx = i - 3;
        if (invIdx >= 0 && invIdx <= 8) {
          x = 8 + invIdx * 18;
          y = 142;
        } else {
          const row = Math.floor((invIdx - 9) / 9);
          const col = (invIdx - 9) % 9;
          x = 8 + col * 18;
          y = 84 + row * 18;
        }
      }

      e.style.left = `${x * scale}px`;
      e.style.top = `${y * scale}px`;
      e.style.width = `${16 * scale}px`;
      e.style.height = `${16 * scale}px`;
      e.style.setProperty('--gui-scale', String(scale));
    });

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
    if (slotIndex >= 0 && slotIndex < 39 && this.slots[slotIndex]) {
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

  public renderIndicators(container: FurnaceContainer | null, smeltingRegistry: SmeltingRegistry, scale = 1): void {
    if (typeof document === 'undefined' || !this.flameEl.style || !this.arrowEl.style) return;
    if (!container) {
      this.flameEl.style.display = 'none';
      this.arrowEl.style.display = 'none';
      return;
    }

    // Flame (14x14 at x=57, y=36)
    if (container.remainingBurnTime > 0 && container.totalBurnTime > 0) {
      const h = Math.min(14, Math.max(1, Math.ceil((container.remainingBurnTime / container.totalBurnTime) * 14)));
      this.flameEl.style.display = 'block';
      this.flameEl.style.width = `${14 * scale}px`;
      this.flameEl.style.height = `${h * scale}px`;
      this.flameEl.style.left = `${57 * scale}px`;
      this.flameEl.style.top = `${(36 + 14 - h) * scale}px`;
      this.flameEl.style.backgroundSize = `${14 * scale}px ${14 * scale}px`;
    } else {
      this.flameEl.style.display = 'none';
    }

    // Arrow (24x17 at x=79, y=34)
    const recipe = smeltingRegistry.getRecipe(container.inputSlot);
    const duration = recipe?.duration ?? 200;
    if (container.smeltProgress > 0) {
      const w = Math.min(24, Math.max(1, Math.floor((container.smeltProgress / duration) * 24)));
      this.arrowEl.style.display = 'block';
      this.arrowEl.style.width = `${w * scale}px`;
      this.arrowEl.style.height = `${17 * scale}px`;
      this.arrowEl.style.left = `${79 * scale}px`;
      this.arrowEl.style.top = `${34 * scale}px`;
      this.arrowEl.style.backgroundSize = `${24 * scale}px ${17 * scale}px`;
    } else {
      this.arrowEl.style.display = 'none';
    }
  }

  public render(
    container: FurnaceContainer | null,
    playerStacks: readonly (ItemStack | null)[],
    renderer: SlotContentRenderer,
    smeltingRegistry: SmeltingRegistry
  ): void {
    if (typeof document === 'undefined') return;
    if (!container) return;

    for (let i = 0; i < 39; i++) {
      const e = this.slots[i];
      if (e) {
        const content = e.querySelector<HTMLElement>('.stage1-slot-content');
        if (content) {
          let stack: ItemStack | null = null;
          if (i === 0) stack = container.inputSlot;
          else if (i === 1) stack = container.fuelSlot;
          else if (i === 2) stack = container.outputSlot;
          else stack = playerStacks[i - 3] ?? null;
          renderer.renderSlot(content, stack);
        }
      }
    }

    this.renderIndicators(container, smeltingRegistry, Number(this.windowEl.style.getPropertyValue('--gui-scale')) || 3);
  }

  public getSlots(): ReadonlyArray<HTMLDivElement> {
    return this.slots;
  }

  public dispose(): void {
    if (typeof document !== 'undefined' && this.root.remove) {
      this.root.remove();
    }
  }
}
