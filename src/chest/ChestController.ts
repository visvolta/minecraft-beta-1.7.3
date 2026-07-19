import { Inventory } from '../inventory/Inventory';
import type { ChestContainer } from './ChestContainer';
import type { CursorHeldItemRenderer } from '../inventory/CursorHeldItemRenderer';
import type { SlotContentRenderer } from '../inventory/SlotContentRenderer';
import type { InventoryTooltip } from '../inventory/InventoryTooltip';
import type { ChestUi } from './ChestUi';
import { ItemStack } from '../inventory/ItemStack';
import { InventoryTransferService } from '../inventory/InventoryTransferService';
import { BaseContainerController } from '../inventory/BaseContainerController';
import type { ItemEntityManager } from '../entities/items/ItemEntityManager';
import type { Player } from '../player/Player';

export class ChestController extends BaseContainerController {
  public activeContainer: ChestContainer | null = null;

  public constructor(
    private readonly ui: ChestUi,
    inventory: Inventory,
    tooltip: InventoryTooltip,
    cursorRenderer: CursorHeldItemRenderer,
    slotRenderer: SlotContentRenderer,
    itemEntityManager: ItemEntityManager,
    player: Player
  ) {
    super(inventory, tooltip, cursorRenderer, slotRenderer, itemEntityManager, player);

    this.ui.setOnSlotClick((slotIndex, e) => {
      if (!this.isOpen || !this.activeContainer) return;

      const isRightClick = e.button === 2;
      const isShiftClick = e.shiftKey;

      if (this.isRightDragging) {
        if (!this.dragSlots.has(slotIndex)) {
          this.dragSlots.add(slotIndex);
        }
        return;
      }

      if (slotIndex < 27) {
        // Click on chest slot
        if (isShiftClick) {
          InventoryTransferService.shiftClickBetweenInventories(
            this.activeContainer.inventory,
            slotIndex,
            this.inventory
          );
        } else if (isRightClick) {
          const res = InventoryTransferService.rightClickSlot(
            this.activeContainer.inventory,
            slotIndex,
            this.cursorStack
          );
          this.cursorStack = res.cursorStack;
        } else {
          const res = InventoryTransferService.leftClickSlot(
            this.activeContainer.inventory,
            slotIndex,
            this.cursorStack
          );
          this.cursorStack = res.cursorStack;
        }
      } else {
        // Click on player inventory slot
        const invIndex = slotIndex - 27;
        if (isShiftClick) {
          InventoryTransferService.shiftClickBetweenInventories(
            this.inventory,
            invIndex,
            this.activeContainer.inventory
          );
        } else if (isRightClick) {
          const res = InventoryTransferService.rightClickSlot(
            this.inventory,
            invIndex,
            this.cursorStack
          );
          this.cursorStack = res.cursorStack;
        } else {
          const res = InventoryTransferService.leftClickSlot(
            this.inventory,
            invIndex,
            this.cursorStack
          );
          this.cursorStack = res.cursorStack;
        }
      }

      this.cursorRenderer.update(0, 0, this.cursorStack, this.slotRenderer, this.scale);
      this.renderAll();
      this.updateTooltip(slotIndex);
    });

    this.ui.setOnSlotHover((slotIndex) => {
      this.hoveredSlotIndex = slotIndex;
      this.updateTooltip(slotIndex);
    });

    this.ui.setOnBackgroundClick((e) => {
      if (!this.isOpen || !this.activeContainer) return;
      if (this.cursorStack !== null && this.cursorStack.count > 0 && !this.isRightDragging) {
        const eyeY = this.player.position.y + 1.62;
        super.handleOutsideClick(e, eyeY);
        this.cursorRenderer.update(0, 0, this.cursorStack, this.slotRenderer, this.scale);
      }
    });

    this.ui.setOnDragEnd(() => {
      if (!this.isOpen || !this.isRightDragging || !this.activeContainer) {
        this.isRightDragging = false;
        this.dragSlots.clear();
        return;
      }

      const chestDragSlots = new Set<number>();
      const invDragSlots = new Set<number>();

      for (const slotIndex of this.dragSlots) {
        if (slotIndex < 27) {
          chestDragSlots.add(slotIndex);
        } else {
          invDragSlots.add(slotIndex - 27);
        }
      }

      if (chestDragSlots.size > 0) {
        const res = InventoryTransferService.rightDrag(
          this.activeContainer.inventory,
          chestDragSlots,
          this.cursorStack
        );
        this.cursorStack = res.cursorStack;
      }

      if (invDragSlots.size > 0) {
        const res = InventoryTransferService.rightDrag(
          this.inventory,
          invDragSlots,
          this.cursorStack
        );
        this.cursorStack = res.cursorStack;
      }

      this.isRightDragging = false;
      this.dragSlots.clear();
      this.cursorRenderer.update(0, 0, this.cursorStack, this.slotRenderer, this.scale);
      this.renderAll();
    });
  }

  public openContainer(container: ChestContainer, scale: number): void {
    super.open();
    this.activeContainer = container;
    container.viewerCount++;
    this.ui.show(scale);
    this.renderAll();
    this.cursorRenderer.update(0, 0, this.cursorStack, this.slotRenderer, this.scale);
  }

  public close(): void {
    if (this.activeContainer) {
      this.activeContainer.viewerCount = Math.max(0, this.activeContainer.viewerCount - 1);
    }
    super.close();
    this.activeContainer = null;
    this.ui.hide();
    this.tooltip.update(0, 0, null);
  }

  public updateScale(scale: number): void {
    if (this.isOpen) {
      this.ui.updateScale(scale);
    }
  }

  public handleNumberKey(digit: number): void {
    if (!this.isOpen || this.hoveredSlotIndex === null || !this.activeContainer) return;
    const hotbarIndex = digit - 1;

    if (this.hoveredSlotIndex >= 27) {
      const invIndex = this.hoveredSlotIndex - 27;
      InventoryTransferService.numberKeySwap(this.inventory, invIndex, hotbarIndex);
    } else {
      const chestSlot = this.hoveredSlotIndex;
      const chestStack = this.activeContainer.inventory.getStack(chestSlot);
      const hotbarStack = this.inventory.getStack(hotbarIndex);

      this.activeContainer.inventory.setStack(chestSlot, hotbarStack);
      this.inventory.setStack(hotbarIndex, chestStack);
    }

    this.renderAll();
    this.updateTooltip(this.hoveredSlotIndex);
  }

  private updateTooltip(slotIndex: number | null): void {
    if (!this.isOpen || slotIndex === null || !this.activeContainer) {
      this.tooltip.update(0, 0, null);
      return;
    }

    if (this.cursorStack !== null) {
      this.tooltip.update(0, 0, null);
      return;
    }

    let stack: ItemStack | null = null;
    if (slotIndex < 27) {
      stack = this.activeContainer.inventory.getStack(slotIndex);
    } else {
      stack = this.inventory.getStack(slotIndex - 27);
    }

    if (stack !== null) {
      const slotEl = this.ui.getSlotElement(slotIndex);
      if (slotEl) {
        const rect = slotEl.getBoundingClientRect();
        this.tooltip.update(rect.left, rect.top, this.getDisplayName(stack), this.ui.getCurrentScale());
      }
    } else {
      this.tooltip.update(0, 0, null);
    }
  }

  public getHoveredStack(): ItemStack | null {
    if (!this.activeContainer || this.hoveredSlotIndex === -1) return null;
    if (this.hoveredSlotIndex < 27) {
      return this.activeContainer.inventory.getStack(this.hoveredSlotIndex);
    } else {
      return this.inventory.getStack(this.hoveredSlotIndex - 27);
    }
  }

  public renderAll(): void {
    if (this.activeContainer) {
      this.ui.renderInventories(this.activeContainer, this.inventory, this.slotRenderer);
    }
  }
}
