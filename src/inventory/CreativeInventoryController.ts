import { ItemStack } from './ItemStack';
import { buildCreativeInventoryEntries, type CreativeInventoryEntry } from './CreativeInventorySource';
import type { CreativeInventoryUi } from './CreativeInventoryUi';
import type { InventoryController } from './InventoryController';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import { DEFAULT_ITEM_DEFINITIONS } from '../items/ItemDefinitionRegistry';
import type { SlotContentRenderer } from './SlotContentRenderer';
import type { InventoryTooltip } from './InventoryTooltip';

export class CreativeInventoryController {
  private readonly entries: CreativeInventoryEntry[];
  public isOpen = false;

  public constructor(
    private readonly ui: CreativeInventoryUi,
    private readonly inventoryController: InventoryController,
    blocks: BlockRegistry,
    private readonly slotRenderer: SlotContentRenderer,
    private readonly tooltip: InventoryTooltip,
    private readonly displayName: (stack: ItemStack) => string,
  ) {
    this.entries = buildCreativeInventoryEntries(blocks, DEFAULT_ITEM_DEFINITIONS);
    this.setupListeners();
  }

  public open(scale: number): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.inventoryController.open(scale);
    this.ui.open(scale);
    this.ui.setPage(this.ui.getPage(), this.entries);
  }

  public close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.ui.close();
    this.inventoryController.close();
    this.tooltip.update(0, 0, null, 1);
  }

  public toggle(scale: number): void { if (this.isOpen) this.close(); else this.open(scale); }
  public dispose(): void { this.close(); }
  public getEntries(): readonly CreativeInventoryEntry[] { return this.entries; }

  private setupListeners(): void {
    if (typeof document === 'undefined') return;
    this.ui.getSourceSlots().forEach((slot, slotIndex) => {
      slot.addEventListener('mouseenter', (event) => {
        if (!this.isOpen) return;
        const entry = this.entryAt(slotIndex);
        if (entry === undefined) return;
        this.tooltip.update(event.clientX, event.clientY, this.displayName(entry.stack), 3);
      });
      slot.addEventListener('mouseleave', () => this.tooltip.update(0, 0, null, 1));
      slot.addEventListener('mousedown', (event) => {
        if (!this.isOpen) return;
        event.preventDefault();
        event.stopPropagation();
        const entry = this.entryAt(slotIndex);
        if (entry === undefined) return;
        const stack = entry.stack.clone();
        stack.count = event.button === 2 ? 1 : entry.stack.count;
        this.inventoryController.cursorStack = stack;
        this.inventoryController.renderAll();
        this.slotRenderer.renderSlot(slot, entry.stack);
      });
    });
    this.ui.root.addEventListener('wheel', (event) => {
      if (!this.isOpen) return;
      event.preventDefault();
      this.ui.setPage(this.ui.getPage() + Math.sign(event.deltaY), this.entries);
    }, { passive: false });
  }

  private entryAt(sourceSlotIndex: number): CreativeInventoryEntry | undefined {
    return this.entries[this.ui.getPage() * this.ui.getPageSize() + sourceSlotIndex];
  }
}
