import type { CreativeInventoryEntry } from './CreativeInventorySource';
import type { SlotContentRenderer } from './SlotContentRenderer';

const SOURCE_COLUMNS = 9;
const SOURCE_ROWS = 5;
const PAGE_SIZE = SOURCE_COLUMNS * SOURCE_ROWS;

export class CreativeInventoryUi {
  public readonly root = typeof document !== 'undefined' ? document.createElement('div') : ({} as HTMLDivElement);
  private readonly windowEl = typeof document !== 'undefined' ? document.createElement('div') : ({} as HTMLDivElement);
  private readonly sourceSlots: HTMLDivElement[] = [];
  private readonly scrollThumb = typeof document !== 'undefined' ? document.createElement('div') : ({} as HTMLDivElement);
  private page = 0;

  public constructor(private readonly slotRenderer: SlotContentRenderer) {
    if (typeof document === 'undefined') return;
    this.root.id = 'creative-inventory-root';
    this.root.style.cssText = 'position:fixed;inset:0;z-index:1001;display:none;pointer-events:none;user-select:none';
    this.windowEl.style.cssText = "position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:194px;height:124px;background:#c6c6c6;border:2px solid #fff;box-shadow:inset -2px -2px #555,inset 2px 2px #ddd;image-rendering:pixelated;pointer-events:auto";
    this.root.append(this.windowEl);

    for (let i = 0; i < PAGE_SIZE; i++) {
      const slot = document.createElement('div');
      slot.className = 'creative-source-slot inventory-slot';
      slot.dataset.creativeSource = String(i);
      const col = i % SOURCE_COLUMNS;
      const row = Math.floor(i / SOURCE_COLUMNS);
      slot.style.cssText = `position:absolute;left:${7 + col * 18}px;top:${7 + row * 18}px;width:16px;height:16px;cursor:pointer;background:rgba(0,0,0,.18);border:1px solid #eee;box-sizing:border-box`;
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
      this.sourceSlots.push(slot);
      this.windowEl.append(slot);
    }

    const track = document.createElement('div');
    track.style.cssText = 'position:absolute;right:6px;top:7px;width:10px;height:88px;background:#8b8b8b;border-left:1px solid #555';
    this.scrollThumb.style.cssText = 'position:absolute;left:1px;top:1px;width:8px;height:14px;background:#d8d8d8;box-shadow:inset -1px -1px #555,inset 1px 1px #fff';
    track.append(this.scrollThumb);
    this.windowEl.append(track);
    document.body.append(this.root);
  }

  public open(scale: number): void {
    if (typeof document === 'undefined') return;
    this.root.style.display = 'block';
    this.windowEl.style.transform = `translate(-50%,-50%) scale(${scale}) translateY(-72px)`;
    this.windowEl.style.transformOrigin = 'center center';
  }

  public close(): void {
    if (typeof document === 'undefined') return;
    this.root.style.display = 'none';
  }

  public getSourceSlots(): readonly HTMLDivElement[] {
    return this.sourceSlots;
  }

  public setPage(page: number, entries: readonly CreativeInventoryEntry[]): void {
    const maxPage = this.getMaxPage(entries);
    this.page = Math.max(0, Math.min(maxPage, page));
    this.render(entries);
  }

  public getPage(): number { return this.page; }
  public getPageSize(): number { return PAGE_SIZE; }
  public getMaxPage(entries: readonly CreativeInventoryEntry[]): number { return Math.max(0, Math.ceil(entries.length / PAGE_SIZE) - 1); }

  public render(entries: readonly CreativeInventoryEntry[]): void {
    const start = this.page * PAGE_SIZE;
    for (let i = 0; i < PAGE_SIZE; i++) {
      this.slotRenderer.renderSlot(this.sourceSlots[i]!, entries[start + i]?.stack ?? null);
    }
    const maxPage = this.getMaxPage(entries);
    const top = maxPage === 0 ? 1 : 1 + Math.round((73 * this.page) / maxPage);
    this.scrollThumb.style.top = `${top}px`;
  }
}
