import { ItemStack } from './ItemStack';
import { buildCreativeInventoryEntries, type CreativeInventoryEntry } from './CreativeInventorySource';
import type { CreativeInventoryTab, CreativeInventoryUi } from './CreativeInventoryUi';
import type { Inventory } from './Inventory';
import { InventoryTransferService } from './InventoryTransferService';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import { DEFAULT_ITEM_DEFINITIONS } from '../items/ItemDefinitionRegistry';
import type { SlotContentRenderer } from './SlotContentRenderer';
import type { InventoryTooltip } from './InventoryTooltip';

export class CreativeInventoryController {
  private readonly allEntries: CreativeInventoryEntry[];
  private readonly scrollByTab = new Map<CreativeInventoryTab, number>();
  public isOpen = false;
  public cursorStack: ItemStack | null = null;
  private activeTab: CreativeInventoryTab = 'creative';
  private draggingScrollbar = false;
  private readonly windowMouseMoveHandler = (event: MouseEvent): void => {
    if (!this.isOpen || !this.draggingScrollbar) return;
    this.setPage(this.ui.pageFromTrackClientY(event.clientY, this.getVisibleEntries()));
  };
  private readonly windowMouseUpHandler = (): void => { this.draggingScrollbar = false; };

  public constructor(
    private readonly ui: CreativeInventoryUi,
    private readonly inventory: Inventory,
    blocks: BlockRegistry,
    _slotRenderer: SlotContentRenderer,
    private readonly tooltip: InventoryTooltip,
    private readonly displayName: (stack: ItemStack) => string,
    private readonly openSurvivalInventory: (() => void) | undefined = undefined,
  ) {
    this.allEntries = buildCreativeInventoryEntries(blocks, DEFAULT_ITEM_DEFINITIONS);
    this.setupListeners();
  }

  public open(scale: number): void {
    if (this.isOpen) return;
    this.isOpen = true;
    if (typeof document !== 'undefined' && document.exitPointerLock) document.exitPointerLock();
    this.ui.open(scale);
    this.setTab(this.activeTab);
  }

  public close(): void {
    if (!this.isOpen) return;
    this.returnCursorStack();
    this.isOpen = false;
    this.draggingScrollbar = false;
    this.ui.close();
    this.tooltip.update(0, 0, null, 1);
  }

  public toggle(scale: number): void { if (this.isOpen) this.close(); else this.open(scale); }
  public dispose(): void {
    this.close();
    if (typeof window !== 'undefined') {
      window.removeEventListener('mousemove', this.windowMouseMoveHandler);
      window.removeEventListener('mouseup', this.windowMouseUpHandler);
    }
    this.ui.dispose();
  }
  public getEntries(): readonly CreativeInventoryEntry[] { return this.allEntries; }
  public getVisibleEntries(): CreativeInventoryEntry[] { return this.filterEntries(this.activeTab); }

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
      slot.addEventListener('mousedown', (event) => this.handleSourceMouseDown(event, slotIndex));
    });

    this.ui.getHotbarSlots().forEach((slot, slotIndex) => {
      slot.addEventListener('mouseenter', (event) => {
        if (!this.isOpen) return;
        const stack = this.inventory.getStack(slotIndex);
        if (stack !== null && this.cursorStack === null) this.tooltip.update(event.clientX, event.clientY, this.displayName(stack), 3);
      });
      slot.addEventListener('mouseleave', () => this.tooltip.update(0, 0, null, 1));
      slot.addEventListener('mousedown', (event) => this.handleHotbarMouseDown(event, slotIndex));
    });

    for (const [tab, button] of this.ui.getTabButtons()) {
      button.addEventListener('mousedown', (event) => {
        if (!this.isOpen) return;
        event.preventDefault();
        event.stopPropagation();
        if (tab === 'survival') {
          this.close();
          this.openSurvivalInventory?.();
          return;
        }
        this.setTab(tab);
      });
    }

    this.ui.getGridViewport().addEventListener('wheel', (event) => {
      if (!this.isOpen) return;
      event.preventDefault();
      this.setPage(this.ui.getPage() + Math.sign(event.deltaY));
    }, { passive: false });

    this.ui.getScrollTrack().addEventListener('mousedown', (event) => {
      if (!this.isOpen) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.target === this.ui.getScrollThumb()) this.draggingScrollbar = true;
      this.setPage(this.ui.pageFromTrackClientY(event.clientY, this.getVisibleEntries()));
    });
    window.addEventListener('mousemove', this.windowMouseMoveHandler);
    window.addEventListener('mouseup', this.windowMouseUpHandler);
  }

  private handleSourceMouseDown(event: MouseEvent, slotIndex: number): void {
    if (!this.isOpen) return;
    event.preventDefault();
    event.stopPropagation();
    const entry = this.entryAt(slotIndex);
    if (entry === undefined) return;
    const stack = entry.stack.clone();
    stack.count = event.button === 2 ? 1 : entry.stack.count;
    this.cursorStack = stack;
    this.renderAll();
  }

  private handleHotbarMouseDown(event: MouseEvent, slotIndex: number): void {
    if (!this.isOpen) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.button === 0) this.cursorStack = InventoryTransferService.leftClickSlot(this.inventory, slotIndex, this.cursorStack).cursorStack;
    else if (event.button === 2) this.cursorStack = InventoryTransferService.rightClickSlot(this.inventory, slotIndex, this.cursorStack).cursorStack;
    this.renderAll();
  }

  private setTab(tab: CreativeInventoryTab): void {
    if (this.activeTab !== tab) this.scrollByTab.set(this.activeTab, this.ui.getPage());
    this.activeTab = tab;
    this.ui.setActiveTab(tab);
    this.ui.setPage(this.scrollByTab.get(tab) ?? 0, this.getVisibleEntries());
    this.renderAll();
  }

  private setPage(page: number): void {
    const visible = this.getVisibleEntries();
    this.ui.setPage(page, visible);
    this.scrollByTab.set(this.activeTab, this.ui.getPage());
  }

  private filterEntries(tab: CreativeInventoryTab): CreativeInventoryEntry[] {
    if (tab === 'creative') return this.allEntries;
    if (tab === 'food') return this.allEntries.filter((entry) => entry.tab === 'food');
    if (tab === 'building') return this.allEntries.filter((entry) => entry.tab === 'building');
    return [];
  }

  private entryAt(sourceSlotIndex: number): CreativeInventoryEntry | undefined {
    return this.getVisibleEntries()[this.ui.getPage() * this.ui.getPageSize() + sourceSlotIndex];
  }

  private renderAll(): void {
    this.ui.render(this.getVisibleEntries());
    this.ui.renderHotbar(Array.from({ length: 9 }, (_, index) => this.inventory.getStack(index)));
  }

  private returnCursorStack(): void {
    if (this.cursorStack === null) return;
    const accepted = this.inventory.insert(this.cursorStack.identity.type, this.cursorStack.identity.id, this.cursorStack.count, this.cursorStack.metadata, this.cursorStack.damage);
    this.cursorStack.count -= accepted;
    if (this.cursorStack.count <= 0) this.cursorStack = null;
  }
}
