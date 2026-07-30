import type { Inventory } from '../inventory/Inventory';
import type { CursorHeldItemRenderer } from '../inventory/CursorHeldItemRenderer';
import type { SlotContentRenderer } from '../inventory/SlotContentRenderer';
import type { InventoryTooltip } from '../inventory/InventoryTooltip';
import type { ItemStack } from '../inventory/ItemStack';
import { InventoryTransferService } from '../inventory/InventoryTransferService';
import { BaseContainerController } from '../inventory/BaseContainerController';
import type { ItemEntityManager } from '../entities/items/ItemEntityManager';
import type { Player } from '../player/Player';
import type { DispenserUi } from './DispenserUi';
import { DISPENSER_SLOT_COUNT } from './DispenserUi';

/**
 * Beta `GuiDispenser` interaction.
 *
 * Slots 0-8 are the dispenser; 9-44 are the player's inventory and hotbar.
 * Shift-click moves a stack between the two inventories, matching
 * `ContainerDispenser.transferStackInSlot`. Cursor-stack handling, outside
 * clicks and pointer-lock release all come from {@link BaseContainerController},
 * so the dispenser behaves exactly like the chest and furnace.
 */
export class DispenserController extends BaseContainerController {
  public activeInventory: Inventory | null = null;
  private position: { x: number; y: number; z: number } | null = null;

  public constructor(
    private readonly ui: DispenserUi,
    inventory: Inventory,
    tooltip: InventoryTooltip,
    cursorRenderer: CursorHeldItemRenderer,
    slotRenderer: SlotContentRenderer,
    itemEntityManager: ItemEntityManager,
    player: Player,
  ) {
    super(inventory, tooltip, cursorRenderer, slotRenderer, itemEntityManager, player);

    this.ui.setOnSlotClick((slotIndex, event) => {
      const container = this.activeInventory;
      if (!this.isOpen || container === null) return;

      const isRightClick = event.button === 2;
      const isShiftClick = event.shiftKey;

      if (slotIndex < DISPENSER_SLOT_COUNT) {
        if (isShiftClick) {
          InventoryTransferService.shiftClickBetweenInventories(container, slotIndex, this.inventory);
        } else if (isRightClick) {
          this.cursorStack = InventoryTransferService.rightClickSlot(container, slotIndex, this.cursorStack).cursorStack;
        } else {
          this.cursorStack = InventoryTransferService.leftClickSlot(container, slotIndex, this.cursorStack).cursorStack;
        }
      } else {
        const invIndex = slotIndex - DISPENSER_SLOT_COUNT;
        if (isShiftClick) {
          InventoryTransferService.shiftClickBetweenInventories(this.inventory, invIndex, container);
        } else if (isRightClick) {
          this.cursorStack = InventoryTransferService.rightClickSlot(this.inventory, invIndex, this.cursorStack).cursorStack;
        } else {
          this.cursorStack = InventoryTransferService.leftClickSlot(this.inventory, invIndex, this.cursorStack).cursorStack;
        }
      }

      this.cursorRenderer.update(event.clientX || 0, event.clientY || 0, this.cursorStack, this.slotRenderer, this.scale);
      this.renderAll();
    });

    this.ui.setOnSlotHover((slotIndex) => {
      this.hoveredSlotIndex = slotIndex;
    });

    this.ui.setOnBackgroundClick((event) => {
      if (!this.isOpen || this.activeInventory === null) return;
      if (this.cursorStack !== null && this.cursorStack.count > 0) {
        super.handleOutsideClick(event, this.player.position.y + 1.62);
        this.cursorRenderer.update(0, 0, this.cursorStack, this.slotRenderer, this.scale);
      }
    });
  }

  public openAt(container: Inventory, position: { x: number; y: number; z: number }, scale: number): void {
    this.activeInventory = container;
    this.position = position;
    this.scale = scale;
    this.ui.open(scale);
    super.open();
    this.renderAll();
  }

  public override close(): void {
    if (!this.isOpen) return;
    // BaseContainerController.close() returns the cursor stack safely.
    super.close();
    this.ui.close();
    this.activeInventory = null;
    this.position = null;
    this.cursorRenderer.update(0, 0, null, this.slotRenderer, this.scale);
  }

  /** World position of the open dispenser, or null when closed. */
  public getPosition(): { x: number; y: number; z: number } | null {
    return this.position;
  }

  private stackAt(index: number): ItemStack | null {
    const container = this.activeInventory;
    if (container === null) return null;
    return index < DISPENSER_SLOT_COUNT
      ? container.getStack(index)
      : this.inventory.getStack(index - DISPENSER_SLOT_COUNT);
  }

  public renderAll(): void {
    if (!this.isOpen) return;
    this.ui.render((index) => this.stackAt(index));
  }

  /** Base-class contract: the stack under the cursor, for tooltips. */
  protected getHoveredStack(slotIndex: number): ItemStack | null {
    return slotIndex < 0 ? null : this.stackAt(slotIndex);
  }
}
