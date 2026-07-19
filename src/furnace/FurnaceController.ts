import type { Inventory } from '../inventory/Inventory';
import type { ItemStack } from '../inventory/ItemStack';
import { BaseContainerController } from '../inventory/BaseContainerController';
import type { FurnaceUi } from './FurnaceUi';
import type { FurnaceContainer } from './FurnaceContainer';
import type { SmeltingRegistry } from './SmeltingRegistry';
import type { FuelRegistry } from './FuelRegistry';
import { FurnaceTransferService } from './FurnaceTransferService';
import type { InventoryTooltip } from '../inventory/InventoryTooltip';
import type { CursorHeldItemRenderer } from '../inventory/CursorHeldItemRenderer';
import type { SlotContentRenderer } from '../inventory/SlotContentRenderer';
import type { ItemEntityManager } from '../entities/items/ItemEntityManager';
import type { Player } from '../player/Player';

export class FurnaceController extends BaseContainerController {
  public activeContainer: FurnaceContainer | null = null;

  public constructor(
    inventory: Inventory,
    private readonly ui: FurnaceUi,
    tooltip: InventoryTooltip,
    cursorRenderer: CursorHeldItemRenderer,
    slotRenderer: SlotContentRenderer,
    itemEntityManager: ItemEntityManager,
    player: Player,
    private readonly smeltingRegistry: SmeltingRegistry,
    private readonly fuelRegistry: FuelRegistry
  ) {
    super(inventory, tooltip, cursorRenderer, slotRenderer, itemEntityManager, player);
    this.setupListeners();
  }

  private setupListeners(): void {
    if (typeof document === 'undefined') return;

    this.ui.getSlots().forEach((slotEl) => {
      const slotIdx = Number(slotEl.dataset.slot);

      slotEl.addEventListener('mouseenter', (e: MouseEvent) => {
        if (!this.isOpen || !this.activeContainer) return;
        this.hoveredSlotIndex = slotIdx;
        this.ui.setHoverHighlight(slotIdx, this.scale);

        const stack = this.getHoveredStack(slotIdx);
        if (stack !== null && this.cursorStack === null) {
          this.tooltip.update(e.clientX, e.clientY, this.getDisplayName(stack), this.scale);
        } else {
          this.tooltip.update(0, 0, null, this.scale);
        }

        if (this.isRightDragging && this.cursorStack !== null) {
          if (!this.dragSlots.has(slotIdx)) {
            this.dragSlots.add(slotIdx);
            const res = FurnaceTransferService.rightDrag(this.activeContainer, this.inventory, new Set([slotIdx]), this.cursorStack);
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
        if (!this.isOpen || !this.activeContainer) return;
        e.stopPropagation();

        if (e.button === 0 || e.button === 2) {
          const res = FurnaceTransferService.onClickSlot(
            this.activeContainer,
            this.inventory,
            slotIdx,
            this.cursorStack,
            e.shiftKey,
            e.button === 2,
            this.smeltingRegistry,
            this.fuelRegistry
          );
          this.cursorStack = res.cursorStack;
          this.renderAll();
          this.cursorRenderer.update(e.clientX, e.clientY, this.cursorStack, this.slotRenderer, this.scale);

          const stack = this.getHoveredStack(slotIdx);
          if (stack !== null && this.cursorStack === null) {
            this.tooltip.update(e.clientX, e.clientY, this.getDisplayName(stack), this.scale);
          } else {
            this.tooltip.update(0, 0, null, this.scale);
          }
        }
      });
    });

    this.ui.root.addEventListener('mousedown', (e: MouseEvent) => {
      if (!this.isOpen) return;
      if (e.target === this.ui.root) {
        const eyeY = this.player.position.y + 1.62;
        this.handleOutsideClick(e, eyeY);
      }
    });
  }

  protected getHoveredStack(slotIndex: number): ItemStack | null {
    if (!this.activeContainer) return null;
    if (slotIndex === 0) return this.activeContainer.inputSlot;
    if (slotIndex === 1) return this.activeContainer.fuelSlot;
    if (slotIndex === 2) return this.activeContainer.outputSlot;
    if (slotIndex >= 3 && slotIndex < 39) return this.inventory.getStack(slotIndex - 3);
    return null;
  }

  protected onInventorySlotModified(): void {
    this.renderAll();
  }

  public openContainer(container: FurnaceContainer, scale: number): void {
    if (this.isOpen) return;
    this.activeContainer = container;
    this.isOpen = true;
    this.scale = scale;
    this.releasePointerLockOnOpen();
    this.ui.open(scale);
    this.renderAll();
  }

  public close(): void {
    if (!this.isOpen) return;
    this.returnCursorStackOnClose();
    this.activeContainer = null;
    this.isOpen = false;
    this.hoveredSlotIndex = -1;
    this.isRightDragging = false;
    this.dragSlots.clear();

    this.ui.close();
    this.tooltip.update(0, 0, null, this.scale);
    this.cursorRenderer.update(0, 0, null, this.slotRenderer, this.scale);
  }

  public updateScale(scale: number): void {
    this.scale = scale;
    if (this.isOpen) {
      this.ui.setScale(scale);
    }
  }

  public renderAll(): void {
    if (!this.activeContainer) return;
    this.ui.render(this.activeContainer, this.inventory.getSlots(), this.slotRenderer, this.smeltingRegistry);
  }

  public dispose(): void {
    this.close();
    this.ui.dispose();
  }
}
