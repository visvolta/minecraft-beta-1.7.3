import { Inventory } from '../inventory/Inventory';
import type { ChestContainer } from './ChestContainer';
import type { CursorHeldItemRenderer } from '../inventory/CursorHeldItemRenderer';
import type { SlotContentRenderer } from '../inventory/SlotContentRenderer';
import type { InventoryTooltip } from '../inventory/InventoryTooltip';
import type { ChestUi } from './ChestUi';
import type { ItemStack } from '../inventory/ItemStack';
import { InventoryTransferService } from '../inventory/InventoryTransferService';
import { BaseContainerController } from '../inventory/BaseContainerController';
import type { ItemEntityManager } from '../entities/items/ItemEntityManager';
import type { Player } from '../player/Player';
import { DoubleChestInventoryProxy } from './DoubleChestInventoryProxy';

export class ChestController extends BaseContainerController {
  public activeContainers: ChestContainer[] = [];
  public activeInventory: Inventory | null = null;
  public isDoubleChest = false;

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
      if (!this.isOpen || !this.activeInventory) return;

      const isRightClick = e.button === 2;
      const isShiftClick = e.shiftKey;

      if (this.isRightDragging) {
        if (!this.dragSlots.has(slotIndex)) {
          this.dragSlots.add(slotIndex);
        }
        return;
      }

      const chestSize = this.isDoubleChest ? 54 : 27;

      if (slotIndex < chestSize) {
        if (isShiftClick) {
          InventoryTransferService.shiftClickBetweenInventories(
            this.activeInventory,
            slotIndex,
            this.inventory
          );
        } else if (isRightClick) {
          const res = InventoryTransferService.rightClickSlot(
            this.activeInventory,
            slotIndex,
            this.cursorStack
          );
          this.cursorStack = res.cursorStack;
        } else {
          const res = InventoryTransferService.leftClickSlot(
            this.activeInventory,
            slotIndex,
            this.cursorStack
          );
          this.cursorStack = res.cursorStack;
        }
      } else {
        const invIndex = slotIndex - chestSize;
        if (isShiftClick) {
          InventoryTransferService.shiftClickBetweenInventories(
            this.inventory,
            invIndex,
            this.activeInventory
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

      this.cursorRenderer.update(e.clientX || 0, e.clientY || 0, this.cursorStack, this.slotRenderer, this.scale);
      this.renderAll();
      this.updateTooltip(slotIndex);
    });

    this.ui.setOnSlotHover((slotIndex) => {
      this.hoveredSlotIndex = slotIndex;
      this.updateTooltip(slotIndex);
    });

    this.ui.setOnBackgroundClick((e) => {
      if (!this.isOpen || !this.activeInventory) return;
      if (this.cursorStack !== null && this.cursorStack.count > 0 && !this.isRightDragging) {
        const eyeY = this.player.position.y + 1.62;
        super.handleOutsideClick(e, eyeY);
        this.cursorRenderer.update(0, 0, this.cursorStack, this.slotRenderer, this.scale);
      }
    });

    this.ui.setOnDragEnd(() => {
      if (!this.isOpen || !this.isRightDragging || !this.activeInventory) {
        this.isRightDragging = false;
        this.dragSlots.clear();
        return;
      }

      const chestSize = this.isDoubleChest ? 54 : 27;
      const chestDragSlots = new Set<number>();
      const invDragSlots = new Set<number>();

      for (const slotIndex of this.dragSlots) {
        if (slotIndex < chestSize) {
          chestDragSlots.add(slotIndex);
        } else {
          invDragSlots.add(slotIndex - chestSize);
        }
      }

      if (chestDragSlots.size > 0) {
        const res = InventoryTransferService.rightDrag(
          this.activeInventory,
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

  public openSingleContainer(container: ChestContainer, scale: number): void {
    super.open();
    this.activeContainers = [container];
    this.activeInventory = container.inventory;
    this.isDoubleChest = false;
    container.viewerCount++;
    this.ui.show(scale, false);
    this.renderAll();
    this.cursorRenderer.update(0, 0, this.cursorStack, this.slotRenderer, this.scale);
  }

  public openDoubleContainer(first: ChestContainer, second: ChestContainer, scale: number): void {
    super.open();
    this.activeContainers = [first, second];
    this.activeInventory = new DoubleChestInventoryProxy(first, second);
    this.isDoubleChest = true;
    first.viewerCount++;
    second.viewerCount++;
    this.ui.show(scale, true);
    this.renderAll();
    this.cursorRenderer.update(0, 0, this.cursorStack, this.slotRenderer, this.scale);
  }

  public close(): void {
    for (const c of this.activeContainers) {
      c.viewerCount = Math.max(0, c.viewerCount - 1);
    }
    super.close();
    this.activeContainers = [];
    this.activeInventory = null;
    this.isDoubleChest = false;
    this.ui.hide();
    this.tooltip.update(0, 0, null);
  }

  public updateScale(scale: number): void {
    if (this.isOpen) {
      this.ui.updateScale(scale, this.isDoubleChest);
    }
  }

  public handleNumberKey(digit: number): void {
    if (!this.isOpen || this.hoveredSlotIndex === null || !this.activeInventory) return;
    const hotbarIndex = digit - 1;
    const chestSize = this.isDoubleChest ? 54 : 27;

    if (this.hoveredSlotIndex >= chestSize) {
      const invIndex = this.hoveredSlotIndex - chestSize;
      InventoryTransferService.numberKeySwap(this.inventory, invIndex, hotbarIndex);
    } else {
      const chestSlot = this.hoveredSlotIndex;
      const chestStack = this.activeInventory.getStack(chestSlot);
      const hotbarStack = this.inventory.getStack(hotbarIndex);

      this.activeInventory.setStack(chestSlot, hotbarStack);
      this.inventory.setStack(hotbarIndex, chestStack);
    }

    this.renderAll();
    this.updateTooltip(this.hoveredSlotIndex);
  }

  private updateTooltip(slotIndex: number | null): void {
    if (!this.isOpen || slotIndex === null || !this.activeInventory) {
      this.tooltip.update(0, 0, null);
      return;
    }

    if (this.cursorStack !== null) {
      this.tooltip.update(0, 0, null);
      return;
    }

    const chestSize = this.isDoubleChest ? 54 : 27;
    let stack: ItemStack | null = null;
    if (slotIndex < chestSize) {
      stack = this.activeInventory.getStack(slotIndex);
    } else {
      stack = this.inventory.getStack(slotIndex - chestSize);
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
    if (!this.activeInventory || this.hoveredSlotIndex === -1) return null;
    const chestSize = this.isDoubleChest ? 54 : 27;
    if (this.hoveredSlotIndex < chestSize) {
      return this.activeInventory.getStack(this.hoveredSlotIndex);
    } else {
      return this.inventory.getStack(this.hoveredSlotIndex - chestSize);
    }
  }

  public renderAll(): void {
    if (this.activeInventory) {
      this.ui.renderInventories(this.activeInventory, this.inventory, this.slotRenderer, this.isDoubleChest);
    }
  }

  public dispose(): void {
    super.dispose();
    this.ui.dispose();
  }
}
