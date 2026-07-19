import type { Inventory } from './Inventory';
import type { ItemStack } from './ItemStack';
import { InventoryTransferService } from './InventoryTransferService';
import type { InventoryTooltip } from './InventoryTooltip';
import type { CursorHeldItemRenderer } from './CursorHeldItemRenderer';
import type { SlotContentRenderer } from './SlotContentRenderer';
import type { ItemEntityManager } from '../entities/items/ItemEntityManager';
import type { Player } from '../player/Player';

/**
 * Shared container-menu interaction base layer (`Reuse or create a shared container-menu interaction layer so inventory and crafting controllers do not duplicate cursor-stack, slot-click, drag, number-key, close-recovery and input-suppression logic`).
 */
export abstract class BaseContainerController {
  public isOpen = false;
  
  public open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.releasePointerLockOnOpen();
  }
  
  public close(): void {
    if (!this.isOpen) return;
    this.returnCursorStackOnClose();
    this.isOpen = false;
  }
  public cursorStack: ItemStack | null = null;
  protected hoveredSlotIndex = -1;
  protected dragSlots = new Set<number>();
  protected isRightDragging = false;
  protected scale = 3;
  protected getDisplayName: (stack: ItemStack) => string = (s) => String(s.identity.id);

  public constructor(
    protected readonly inventory: Inventory,
    protected readonly tooltip: InventoryTooltip,
    protected readonly cursorRenderer: CursorHeldItemRenderer,
    protected readonly slotRenderer: SlotContentRenderer,
    protected readonly itemEntityManager: ItemEntityManager,
    protected readonly player: Player
  ) {
    this.setupCommonListeners();
  }

  public setDisplayNameResolver(resolver: (stack: ItemStack) => string): void {
    this.getDisplayName = resolver;
  }

  protected setupCommonListeners(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('mouseup', (e: MouseEvent) => {
      if (!this.isOpen) return;
      if (e.button === 2) {
        this.isRightDragging = false;
        this.dragSlots.clear();
      }
    });

    window.addEventListener('mousemove', (e: MouseEvent) => {
      if (!this.isOpen) return;
      if (this.cursorStack !== null) {
        this.cursorRenderer.update(e.clientX, e.clientY, this.cursorStack, this.slotRenderer, this.scale);
        this.tooltip.update(0, 0, null, this.scale);
      } else if (this.hoveredSlotIndex >= 0) {
        const stack = this.getHoveredStack(this.hoveredSlotIndex);
        if (stack !== null) {
          this.tooltip.update(e.clientX, e.clientY, this.getDisplayName(stack), this.scale);
        } else {
          this.tooltip.update(0, 0, null, this.scale);
        }
      }
    });
  }

  protected abstract getHoveredStack(slotIndex: number): ItemStack | null;
  public abstract renderAll(): void;

  public handleNumberKey(digit: number): void {
    if (!this.isOpen || this.hoveredSlotIndex < 0 || this.hoveredSlotIndex >= 36) return;
    const hotbarIdx = digit - 1; // 1-9 -> 0-8
    if (hotbarIdx < 0 || hotbarIdx > 8) return;

    InventoryTransferService.numberKeySwap(this.inventory, this.hoveredSlotIndex, hotbarIdx);
    this.onInventorySlotModified();
    this.renderAll();
    const stack = this.inventory.getStack(this.hoveredSlotIndex);
    if (stack !== null && this.cursorStack === null) {
      this.tooltip.update(0, 0, null, this.scale); // clear briefly
    }
  }

  protected onInventorySlotModified(): void {}

  protected handleOutsideClick(e: MouseEvent, eyeY: number): void {
    if (this.cursorStack !== null) {
      if (e.button === 0) {
        // Left click outside drops all
        this.itemEntityManager.spawnThrownItem(
          this.player.position.x,
          eyeY - 0.3,
          this.player.position.z,
          {
            type: this.cursorStack.identity.type,
            id: this.cursorStack.identity.id,
            count: this.cursorStack.count,
            metadata: this.cursorStack.metadata
          },
          0, 0.2, 0,
          40
        );
        this.cursorStack = null;
      } else if (e.button === 2) {
        // Right click outside drops 1
        this.itemEntityManager.spawnThrownItem(
          this.player.position.x,
          eyeY - 0.3,
          this.player.position.z,
          {
            type: this.cursorStack.identity.type,
            id: this.cursorStack.identity.id,
            count: 1,
            metadata: this.cursorStack.metadata
          },
          0, 0.2, 0,
          40
        );
        this.cursorStack.count--;
        if (this.cursorStack.count <= 0) {
          this.cursorStack = null;
        }
      }
      this.renderAll();
      this.cursorRenderer.update(e.clientX, e.clientY, this.cursorStack, this.slotRenderer, this.scale);
    }
  }

  protected releasePointerLockOnOpen(): void {
    if (typeof document !== 'undefined' && document.exitPointerLock) {
      document.exitPointerLock();
    }
  }

  /**
   * Returns remaining cursor stack to inventory or drops overflow (`On inventory close, reinsert cursor stack into partial stacks and empty slots, then drop only remaining overflow`).
   */
  protected returnCursorStackOnClose(): void {
    if (this.cursorStack !== null) {
      const accepted = this.inventory.insert(
        this.cursorStack.identity.type,
        this.cursorStack.identity.id,
        this.cursorStack.count,
        this.cursorStack.metadata
      );
      this.cursorStack.count -= accepted;
      if (this.cursorStack.count > 0) {
        const eyeY = this.player.position.y + 1.62;
        this.itemEntityManager.spawnThrownItem(
          this.player.position.x,
          eyeY - 0.3,
          this.player.position.z,
          {
            type: this.cursorStack.identity.type,
            id: this.cursorStack.identity.id,
            count: this.cursorStack.count,
            metadata: this.cursorStack.metadata
          },
          0, 0.2, 0,
          40
        );
      }
      this.cursorStack = null;
    }
  }
}
