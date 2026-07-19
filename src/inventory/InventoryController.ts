import type { Inventory } from './Inventory';
import type { ItemStack } from './ItemStack';
import { InventoryTransferService } from './InventoryTransferService';
import type { InventoryUi } from './InventoryUi';
import type { InventoryTooltip } from './InventoryTooltip';
import type { CursorHeldItemRenderer } from './CursorHeldItemRenderer';
import type { SlotContentRenderer } from './SlotContentRenderer';
import type { ItemEntityManager } from '../entities/items/ItemEntityManager';
import type { Player } from '../player/Player';
import { BaseContainerController } from './BaseContainerController';
import { CraftingGrid } from '../crafting/CraftingGrid';
import type { RecipeRegistry } from '../crafting/RecipeRegistry';
import { CraftingTransferService } from '../crafting/CraftingTransferService';

export class InventoryController extends BaseContainerController {
  public readonly craftingGrid = new CraftingGrid(2, 2);
  public resultSlotStack: ItemStack | null = null;

  public constructor(
    inventory: Inventory,
    private readonly ui: InventoryUi,
    tooltip: InventoryTooltip,
    cursorRenderer: CursorHeldItemRenderer,
    slotRenderer: SlotContentRenderer,
    itemEntityManager: ItemEntityManager,
    player: Player,
    private readonly recipeRegistry: RecipeRegistry
  ) {
    super(inventory, tooltip, cursorRenderer, slotRenderer, itemEntityManager, player);
    this.setupListeners();
  }

  private setupListeners(): void {
    if (typeof document === 'undefined') return;

    // Player slots 0..35
    this.ui.getSlots().forEach((slotEl) => {
      const slotIdx = Number(slotEl.dataset.slot);

      slotEl.addEventListener('mouseenter', (e: MouseEvent) => {
        if (!this.isOpen) return;
        this.hoveredSlotIndex = slotIdx;
        this.ui.setHoverHighlight(slotIdx, this.scale);

        const stack = this.inventory.getStack(slotIdx);
        if (stack !== null && this.cursorStack === null) {
          this.tooltip.update(e.clientX, e.clientY, this.getDisplayName(stack), this.scale);
        } else {
          this.tooltip.update(0, 0, null, this.scale);
        }

        if (this.isRightDragging && this.cursorStack !== null) {
          if (!this.dragSlots.has(slotIdx)) {
            this.dragSlots.add(slotIdx);
            const res = InventoryTransferService.rightDrag(this.inventory, new Set([slotIdx]), this.cursorStack);
            this.cursorStack = res.cursorStack;
            this.renderAll();
            this.cursorRenderer.update(e.clientX, e.clientY, this.cursorStack, this.slotRenderer, this.scale);
          }
        }
      });

      slotEl.addEventListener('mouseleave', () => {
        if (!this.isOpen) return;
        if (this.hoveredSlotIndex === slotIdx) {
          this.hoveredSlotIndex = -1;
          this.ui.hideHoverHighlight();
          this.tooltip.update(0, 0, null, this.scale);
        }
      });

      slotEl.addEventListener('mousedown', (e: MouseEvent) => {
        if (!this.isOpen) return;
        e.stopPropagation();

        if (e.button === 0) {
          if (e.shiftKey) {
            InventoryTransferService.shiftClickSlot(this.inventory, slotIdx);
          } else {
            const res = InventoryTransferService.leftClickSlot(this.inventory, slotIdx, this.cursorStack);
            this.cursorStack = res.cursorStack;
          }
          this.renderAll();
          this.cursorRenderer.update(e.clientX, e.clientY, this.cursorStack, this.slotRenderer, this.scale);
          const stack = this.inventory.getStack(slotIdx);
          if (stack !== null && this.cursorStack === null) {
            this.tooltip.update(e.clientX, e.clientY, this.getDisplayName(stack), this.scale);
          } else {
            this.tooltip.update(0, 0, null, this.scale);
          }
        } else if (e.button === 2) {
          this.isRightDragging = true;
          this.dragSlots.clear();
          this.dragSlots.add(slotIdx);

          const res = InventoryTransferService.rightClickSlot(this.inventory, slotIdx, this.cursorStack);
          this.cursorStack = res.cursorStack;
          this.renderAll();
          this.cursorRenderer.update(e.clientX, e.clientY, this.cursorStack, this.slotRenderer, this.scale);
          const stack = this.inventory.getStack(slotIdx);
          if (stack !== null && this.cursorStack === null) {
            this.tooltip.update(e.clientX, e.clientY, this.getDisplayName(stack), this.scale);
          } else {
            this.tooltip.update(0, 0, null, this.scale);
          }
        }
      });
    });

    // 2x2 Crafting input slots 0..3
    this.ui.getCraftingSlots().forEach((slotEl, idx) => {
      slotEl.addEventListener('mouseenter', (e: MouseEvent) => {
        if (!this.isOpen) return;
        this.hoveredSlotIndex = -100 - idx; // negative index distinguishing crafting
        this.ui.setHoverHighlightOnElement(slotEl, this.scale);

        const stack = this.craftingGrid.getStack(idx);
        if (stack !== null && this.cursorStack === null) {
          this.tooltip.update(e.clientX, e.clientY, this.getDisplayName(stack), this.scale);
        } else {
          this.tooltip.update(0, 0, null, this.scale);
        }

        if (this.isRightDragging && this.cursorStack !== null) {
          if (!this.dragSlots.has(-100 - idx)) {
            this.dragSlots.add(-100 - idx);
            if (this.craftingGrid.getStack(idx) === null) {
              const single = this.cursorStack.clone();
              single.count = 1;
              this.craftingGrid.setStack(idx, single);
              this.cursorStack.count--;
              if (this.cursorStack.count <= 0) this.cursorStack = null;
              this.onCraftingGridChanged();
              this.renderAll();
              this.cursorRenderer.update(e.clientX, e.clientY, this.cursorStack, this.slotRenderer, this.scale);
            } else if (this.craftingGrid.getStack(idx)!.matches(this.cursorStack) && this.craftingGrid.getStack(idx)!.count < 64) {
              this.craftingGrid.getStack(idx)!.count++;
              this.cursorStack.count--;
              if (this.cursorStack.count <= 0) this.cursorStack = null;
              this.onCraftingGridChanged();
              this.renderAll();
              this.cursorRenderer.update(e.clientX, e.clientY, this.cursorStack, this.slotRenderer, this.scale);
            }
          }
        }
      });

      slotEl.addEventListener('mouseleave', () => {
        if (!this.isOpen) return;
        if (this.hoveredSlotIndex === -100 - idx) {
          this.hoveredSlotIndex = -1;
          this.ui.hideHoverHighlight();
          this.tooltip.update(0, 0, null, this.scale);
        }
      });

      slotEl.addEventListener('mousedown', (e: MouseEvent) => {
        if (!this.isOpen) return;
        e.stopPropagation();

        const slotStack = this.craftingGrid.getStack(idx);
        if (e.button === 0) {
          if (this.cursorStack === null) {
            if (slotStack !== null) {
              this.cursorStack = slotStack;
              this.craftingGrid.setStack(idx, null);
            }
          } else {
            if (slotStack === null) {
              this.craftingGrid.setStack(idx, this.cursorStack);
              this.cursorStack = null;
            } else if (slotStack.matches(this.cursorStack)) {
              const space = 64 - slotStack.count;
              const toAdd = Math.min(space, this.cursorStack.count);
              slotStack.count += toAdd;
              this.cursorStack.count -= toAdd;
              if (this.cursorStack.count <= 0) this.cursorStack = null;
            } else {
              this.craftingGrid.setStack(idx, this.cursorStack);
              this.cursorStack = slotStack;
            }
          }
          this.onCraftingGridChanged();
          this.renderAll();
          this.cursorRenderer.update(e.clientX, e.clientY, this.cursorStack, this.slotRenderer, this.scale);
        } else if (e.button === 2) {
          this.isRightDragging = true;
          this.dragSlots.clear();
          this.dragSlots.add(-100 - idx);

          if (this.cursorStack === null) {
            if (slotStack !== null && slotStack.count > 0) {
              const toTake = Math.ceil(slotStack.count / 2);
              this.cursorStack = slotStack.clone();
              this.cursorStack.count = toTake;
              slotStack.count -= toTake;
              if (slotStack.count <= 0) this.craftingGrid.setStack(idx, null);
            }
          } else {
            if (slotStack === null) {
              const single = this.cursorStack.clone();
              single.count = 1;
              this.craftingGrid.setStack(idx, single);
              this.cursorStack.count--;
              if (this.cursorStack.count <= 0) this.cursorStack = null;
            } else if (slotStack.matches(this.cursorStack) && slotStack.count < 64) {
              slotStack.count++;
              this.cursorStack.count--;
              if (this.cursorStack.count <= 0) this.cursorStack = null;
            }
          }
          this.onCraftingGridChanged();
          this.renderAll();
          this.cursorRenderer.update(e.clientX, e.clientY, this.cursorStack, this.slotRenderer, this.scale);
        }
      });
    });

    // Result slot
    const resultEl = this.ui.getResultSlot();
    if (resultEl) {
      resultEl.addEventListener('mouseenter', (e: MouseEvent) => {
        if (!this.isOpen) return;
        this.hoveredSlotIndex = -999;
        this.ui.setHoverHighlightOnElement(resultEl, this.scale);
        if (this.resultSlotStack !== null && this.cursorStack === null) {
          this.tooltip.update(e.clientX, e.clientY, this.getDisplayName(this.resultSlotStack), this.scale);
        } else {
          this.tooltip.update(0, 0, null, this.scale);
        }
      });

      resultEl.addEventListener('mouseleave', () => {
        if (!this.isOpen) return;
        if (this.hoveredSlotIndex === -999) {
          this.hoveredSlotIndex = -1;
          this.ui.hideHoverHighlight();
          this.tooltip.update(0, 0, null, this.scale);
        }
      });

      resultEl.addEventListener('mousedown', (e: MouseEvent) => {
        if (!this.isOpen) return;
        e.stopPropagation();
        if (this.resultSlotStack === null) return;

        const res = CraftingTransferService.onClickResultSlot(
          this.inventory,
          this.craftingGrid,
          this.resultSlotStack,
          this.cursorStack,
          e.shiftKey,
          this.itemEntityManager,
          this.player,
          this.recipeRegistry
        );
        this.cursorStack = res.cursorStack;
        this.resultSlotStack = res.resultSlotStack;
        this.renderAll();
        this.cursorRenderer.update(e.clientX, e.clientY, this.cursorStack, this.slotRenderer, this.scale);
        if (this.resultSlotStack !== null && this.cursorStack === null) {
          this.tooltip.update(e.clientX, e.clientY, this.getDisplayName(this.resultSlotStack), this.scale);
        } else {
          this.tooltip.update(0, 0, null, this.scale);
        }
      });
    }

    this.ui.root.addEventListener('mousedown', (e: MouseEvent) => {
      if (!this.isOpen) return;
      if (e.target === this.ui.root) {
        const eyeY = this.player.position.y + 1.62;
        this.handleOutsideClick(e, eyeY);
      }
    });
  }

  private onCraftingGridChanged(): void {
    this.resultSlotStack = CraftingTransferService.onGridChanged(this.craftingGrid, this.recipeRegistry);
  }

  protected getHoveredStack(slotIndex: number): ItemStack | null {
    if (slotIndex >= 0 && slotIndex < 36) return this.inventory.getStack(slotIndex);
    return null;
  }

  protected onInventorySlotModified(): void {
    this.renderAll();
  }

  public open(scale: number): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.scale = scale;
    this.releasePointerLockOnOpen();
    this.ui.open(scale);
    this.onCraftingGridChanged();
    this.renderAll();
  }

  public close(): void {
    if (!this.isOpen) return;
    this.returnCursorStackOnClose();
    CraftingTransferService.closeRecovery(this.craftingGrid, this.inventory, this.itemEntityManager, this.player);
    this.resultSlotStack = null;

    this.isOpen = false;
    this.hoveredSlotIndex = -1;
    this.isRightDragging = false;
    this.dragSlots.clear();

    this.ui.close();
    this.tooltip.update(0, 0, null, this.scale);
    this.cursorRenderer.update(0, 0, null, this.slotRenderer, this.scale);
  }

  public toggle(scale: number): void {
    if (this.isOpen) this.close();
    else this.open(scale);
  }

  public updateScale(scale: number): void {
    this.scale = scale;
    if (this.isOpen) {
      this.ui.setScale(scale);
    }
  }

  public renderAll(): void {
    this.ui.render(this.inventory.getSlots(), this.craftingGrid.getSlots(), this.resultSlotStack, this.slotRenderer);
  }

  public dispose(): void {
    this.close();
    this.ui.dispose();
  }
}
