import type { CreativeInventoryEntry } from './CreativeInventorySource';
import type { SlotContentRenderer } from './SlotContentRenderer';

export type CreativeInventoryTab = 'survival' | 'creative' | 'food' | 'building';

const GUI_W = 195;
const GUI_H = 136;
const SLOT = 16;
const STEP = 18;
const GRID_X = 7;
const GRID_Y = 0;
const GRID_COLS = 9;
const GRID_ROWS = 5;
const GRID_VIEW_W = GRID_COLS * STEP;
const GRID_VIEW_H = GRID_ROWS * STEP;
const HOTBAR_Y = 112;
const SCROLL_X = 174;
const SCROLL_Y = 1;
const SCROLL_TRACK_H = 88;
const THUMB_H = 15;
const PAGE_SIZE = GRID_COLS * GRID_ROWS;
const ASSET = '/textures/gui/creative/';

const TAB_ICONS: Readonly<Record<CreativeInventoryTab, string>> = {
  survival: `${ASSET}survivual_icon.png`,
  creative: `${ASSET}creative_tab_icon.png`,
  food: `${ASSET}food_tab_icon.png`,
  building: `${ASSET}building_tab_icon.png`,
};

export class CreativeInventoryUi {
  public readonly root = typeof document !== 'undefined' ? document.createElement('div') : ({} as HTMLDivElement);
  private readonly windowEl = typeof document !== 'undefined' ? document.createElement('div') : ({} as HTMLDivElement);
  private readonly gridViewport = typeof document !== 'undefined' ? document.createElement('div') : ({} as HTMLDivElement);
  private readonly sourceSlots: HTMLDivElement[] = [];
  private readonly hotbarSlots: HTMLDivElement[] = [];
  private readonly tabButtons = new Map<CreativeInventoryTab, HTMLButtonElement>();
  private readonly scrollTrack = typeof document !== 'undefined' ? document.createElement('div') : ({} as HTMLDivElement);
  private readonly scrollThumb = typeof document !== 'undefined' ? document.createElement('img') : ({} as HTMLImageElement);
  private page = 0;
  private activeTab: CreativeInventoryTab = 'creative';
  private scale = 3;

  public constructor(private readonly slotRenderer: SlotContentRenderer) {
    if (typeof document === 'undefined') return;
    this.root.id = 'creative-inventory-root';
    this.root.style.cssText = 'position:fixed;inset:0;z-index:1001;display:none;pointer-events:none;user-select:none';
    this.windowEl.style.cssText = `position:absolute;left:50%;top:50%;width:${GUI_W}px;height:${GUI_H}px;background:url('${ASSET}creative_itemmenu.png') 0 0 / ${GUI_W}px ${GUI_H}px no-repeat;image-rendering:pixelated;pointer-events:auto`;
    this.root.append(this.windowEl);
    this.createTabs();
    this.createGrid();
    this.createHotbar();
    this.createScrollbar();
    document.body.append(this.root);
  }

  private createTabs(): void {
    const tabs: readonly CreativeInventoryTab[] = ['survival', 'creative', 'food', 'building'];
    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i]!;
      const button = document.createElement('button');
      button.dataset.creativeTab = tab;
      const left = 4 + i * 29;
      button.style.cssText = `position:absolute;left:${left}px;top:-32px;width:28px;height:32px;padding:0;border:0;background:transparent;image-rendering:pixelated;cursor:pointer`;
      const bg = document.createElement('img');
      bg.draggable = false;
      bg.style.cssText = 'position:absolute;left:0;image-rendering:pixelated;pointer-events:none';
      bg.className = 'creative-tab-bg';
      const icon = document.createElement('img');
      icon.src = TAB_ICONS[tab];
      icon.draggable = false;
      icon.style.cssText = 'position:absolute;left:6px;top:6px;width:16px;height:16px;image-rendering:pixelated;pointer-events:none';
      button.append(bg, icon);
      this.tabButtons.set(tab, button);
      this.windowEl.append(button);
    }
    this.updateTabVisuals();
  }

  private tabBackground(tab: CreativeInventoryTab, selected: boolean): string {
    if (tab === 'survival') return selected ? `${ASSET}leftcorner_tab_selected_tall.png` : `${ASSET}middle_tab.png`;
    if (tab === 'building') return selected ? `${ASSET}rightcorner_tab_selected.png` : `${ASSET}rightcorner_tab.png`;
    return selected ? `${ASSET}middle_tab_selected.png` : `${ASSET}middle_tab.png`;
  }

  private updateTabVisuals(): void {
    for (const [tab, button] of this.tabButtons) {
      const selected = tab === this.activeTab;
      const bg = button.querySelector<HTMLImageElement>('.creative-tab-bg');
      if (bg) {
        bg.src = this.tabBackground(tab, selected);
        const height = selected ? 32 : (tab === 'building' ? 27 : 25);
        bg.style.top = `${32 - height}px`;
        bg.style.width = '28px';
        bg.style.height = `${height}px`;
      }
      button.style.zIndex = selected ? '2' : '1';
    }
  }

  private createGrid(): void {
    this.gridViewport.style.cssText = `position:absolute;left:${GRID_X}px;top:${GRID_Y}px;width:${GRID_VIEW_W}px;height:${GRID_VIEW_H}px;overflow:hidden;image-rendering:pixelated`;
    this.windowEl.append(this.gridViewport);
    for (let i = 0; i < PAGE_SIZE; i++) {
      const slot = this.createSlot(`source-${i}`);
      const col = i % GRID_COLS;
      const row = Math.floor(i / GRID_COLS);
      slot.dataset.creativeSource = String(i);
      slot.style.left = `${col * STEP + 1}px`;
      slot.style.top = `${row * STEP + 1}px`;
      this.sourceSlots.push(slot);
      this.gridViewport.append(slot);
    }
  }

  private createHotbar(): void {
    for (let i = 0; i < 9; i++) {
      const slot = this.createSlot(`hotbar-${i}`);
      slot.dataset.creativeHotbar = String(i);
      slot.style.left = `${GRID_X + i * STEP}px`;
      slot.style.top = `${HOTBAR_Y}px`;
      this.hotbarSlots.push(slot);
      this.windowEl.append(slot);
    }
  }

  private createScrollbar(): void {
    this.scrollTrack.dataset.creativeScrollTrack = 'true';
    this.scrollTrack.style.cssText = `position:absolute;left:${SCROLL_X}px;top:${SCROLL_Y}px;width:12px;height:${SCROLL_TRACK_H}px;cursor:pointer`;
    this.scrollThumb.src = `${ASSET}scroll_bar.png`;
    this.scrollThumb.draggable = false;
    this.scrollThumb.style.cssText = 'position:absolute;left:0;top:0;width:12px;height:15px;image-rendering:pixelated;cursor:grab';
    this.scrollTrack.append(this.scrollThumb);
    this.windowEl.append(this.scrollTrack);
  }

  private createSlot(id: string): HTMLDivElement {
    const slot = document.createElement('div');
    slot.id = `creative-${id}`;
    slot.className = 'creative-slot inventory-slot';
    slot.style.cssText = `position:absolute;width:${SLOT}px;height:${SLOT}px;cursor:pointer`;
    const content = document.createElement('div');
    content.className = 'stage1-slot-content';
    content.style.cssText = 'width:100%;height:100%;pointer-events:none';
    const img = document.createElement('img');
    img.className = 'stage1-icon';
    img.draggable = false;
    const count = document.createElement('span');
    count.className = 'stage1-count';
    content.append(img, count);
    slot.append(content);
    return slot;
  }

  public open(scale: number): void {
    if (typeof document === 'undefined') return;
    this.scale = Math.max(1, Math.round(scale));
    this.root.style.display = 'block';
    this.windowEl.style.transform = `translate(-50%,-50%) scale(${this.scale})`;
    this.windowEl.style.transformOrigin = 'center center';
  }

  public close(): void {
    if (typeof document === 'undefined') return;
    this.root.style.display = 'none';
  }

  public dispose(): void {
    this.root.remove?.();
    this.sourceSlots.length = 0;
    this.hotbarSlots.length = 0;
    this.tabButtons.clear();
  }

  public getSourceSlots(): readonly HTMLDivElement[] { return this.sourceSlots; }
  public getHotbarSlots(): readonly HTMLDivElement[] { return this.hotbarSlots; }
  public getTabButtons(): ReadonlyMap<CreativeInventoryTab, HTMLButtonElement> { return this.tabButtons; }
  public getScrollTrack(): HTMLDivElement { return this.scrollTrack; }
  public getScrollThumb(): HTMLImageElement { return this.scrollThumb; }
  public getGridViewport(): HTMLDivElement { return this.gridViewport; }
  public getPage(): number { return this.page; }
  public getPageSize(): number { return PAGE_SIZE; }
  public getActiveTab(): CreativeInventoryTab { return this.activeTab; }
  public getMaxPage(entries: readonly CreativeInventoryEntry[]): number { return Math.max(0, Math.ceil(entries.length / PAGE_SIZE) - 1); }

  public setActiveTab(tab: CreativeInventoryTab): void {
    this.activeTab = tab;
    this.updateTabVisuals();
  }

  public setPage(page: number, entries: readonly CreativeInventoryEntry[]): void {
    const maxPage = this.getMaxPage(entries);
    this.page = Math.max(0, Math.min(maxPage, page));
    this.render(entries);
  }

  public pageFromTrackClientY(clientY: number, entries: readonly CreativeInventoryEntry[]): number {
    const rect = this.scrollTrack.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / Math.max(1, rect.height)));
    return Math.round(ratio * this.getMaxPage(entries));
  }

  public render(entries: readonly CreativeInventoryEntry[]): void {
    const start = this.page * PAGE_SIZE;
    for (let i = 0; i < PAGE_SIZE; i++) this.slotRenderer.renderSlot(this.sourceSlots[i]!, entries[start + i]?.stack ?? null);
    const maxPage = this.getMaxPage(entries);
    const maxThumbTop = SCROLL_TRACK_H - THUMB_H;
    const top = maxPage === 0 ? 0 : Math.round((maxThumbTop * this.page) / maxPage);
    this.scrollThumb.style.top = `${top}px`;
  }

  public renderHotbar(stacks: readonly (import('./ItemStack').ItemStack | null)[]): void {
    for (let i = 0; i < this.hotbarSlots.length; i++) this.slotRenderer.renderSlot(this.hotbarSlots[i]!, stacks[i] ?? null);
  }
}
