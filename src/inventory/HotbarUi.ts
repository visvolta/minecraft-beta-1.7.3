import type { SlotRect } from './HotbarLayout';
import type { ItemStack } from '../inventory/ItemStack';

/** Explicit, single hotbar DOM owner. It receives inventory snapshots only. */
export class HotbarUi {
  readonly root = typeof document !== 'undefined' ? document.createElement('div') : ({} as any);
  private bar = typeof document !== 'undefined' ? document.createElement('div') : ({} as any);
  private slots: HTMLDivElement[] = [];

  constructor() {
    if (typeof document === 'undefined') return;
    this.root.id = 'stage1-hud';
    this.bar.className = 'stage1-hotbar';
    this.root.append(this.bar);

    for (let i = 0; i < 9; i++) {
      const e = document.createElement('div');
      e.className = 'stage1-slot';
      const content = document.createElement('div');
      content.className = 'stage1-slot-content';
      const img = document.createElement('img');
      img.className = 'stage1-icon';
      img.draggable = false;
      const count = document.createElement('span');
      count.className = 'stage1-count';
      content.append(img, count);
      e.append(content);
      this.bar.append(e);
      this.slots.push(e);
    }

    document.body.append(this.root);
  }

  render(
    stacks: readonly (ItemStack | null)[],
    selected: number,
    rects: readonly SlotRect[],
    resolve: (stack: ItemStack) => string
  ): void {
    if (typeof document === 'undefined') return;
    this.slots.forEach((e, i) => {
      const s = stacks[i] ?? null;
      const r = rects[i]!;
      const guiScale = Math.max(1, r.size / 20);

      e.style.left = `${r.x}px`;
      e.style.top = `${r.y}px`;
      e.style.width = `${r.size}px`;
      e.style.height = `${r.size}px`;
      e.style.setProperty('--gui-scale', String(guiScale));

      e.classList.toggle('selected', i === selected);

      const img = e.querySelector<HTMLImageElement>('.stage1-icon')!;
      const count = e.querySelector<HTMLSpanElement>('.stage1-count')!;
      img.hidden = s === null;
      if (s) {
        img.src = resolve(s);
      }
      if (s && s.count > 1) {
        count.hidden = false;
        count.textContent = String(s.count);
      } else {
        count.hidden = true;
        count.textContent = '';
      }
    });
  }

  dispose(): void {
    if (typeof document !== 'undefined' && this.root.remove) {
      this.root.remove();
    }
  }
}
