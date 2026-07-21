/** Manual-spawn mob types (debug only; natural spawning is a later stage). */
export type MobType = 'pig' | 'cow' | 'sheep' | 'chicken';

const MOB_LABELS: readonly { type: MobType; label: string }[] = [
  { type: 'pig', label: 'Pig' },
  { type: 'cow', label: 'Cow' },
  { type: 'sheep', label: 'Sheep' },
  { type: 'chicken', label: 'Chicken' },
];

/**
 * F1 debug "Mob Spawn" menu: a small self-contained HTML modal that lets the
 * player manually spawn a passive mob. Routes every selection through a single
 * `onSelect` callback (the Engine's shared spawnMob). Debug-only — no natural
 * spawning.
 *
 * Controls: F1 open/close; mouse click a button; keyboard 1–4 spawn directly;
 * Arrow keys move the highlight and Enter selects; Escape closes. While open,
 * the browser's default F1 help is suppressed and the Engine suppresses
 * gameplay input (see Engine input gating on `isOpen`).
 */
export class MobSpawnMenu {
  private readonly element: HTMLDivElement;
  private readonly buttons: HTMLButtonElement[] = [];
  private visible = false;
  private highlight = 0;

  public constructor(private readonly onSelect: (type: MobType) => void) {
    this.element = document.createElement('div');
    this.buildDom();
    this.element.style.display = 'none';
    window.addEventListener('keydown', this.handleKeyDown);
  }

  private buildDom(): void {
    const el = this.element;
    el.style.cssText = [
      'position:fixed', 'inset:0', 'display:none', 'align-items:center', 'justify-content:center',
      'background:rgba(0,0,0,0.45)', 'z-index:50', 'font-family:monospace', 'user-select:none',
    ].join(';');

    const panel = document.createElement('div');
    panel.style.cssText = [
      'background:rgba(20,20,20,0.92)', 'border:2px solid #555', 'padding:16px 20px',
      'display:flex', 'flex-direction:column', 'gap:8px', 'min-width:200px',
    ].join(';');

    const title = document.createElement('div');
    title.textContent = 'Mob Spawn (debug)';
    title.style.cssText = 'color:#fff;font-weight:bold;margin-bottom:6px;text-align:center';
    panel.appendChild(title);

    MOB_LABELS.forEach(({ type, label }, index) => {
      const button = document.createElement('button');
      button.textContent = `${index + 1}. ${label}`;
      button.style.cssText = [
        'padding:8px 12px', 'font-family:monospace', 'font-size:14px', 'cursor:pointer',
        'background:#333', 'color:#eee', 'border:1px solid #666', 'text-align:left',
      ].join(';');
      button.addEventListener('click', () => this.select(type));
      button.addEventListener('mouseenter', () => this.setHighlight(index));
      this.buttons.push(button);
      panel.appendChild(button);
    });

    const hint = document.createElement('div');
    hint.textContent = 'F1 close · ↑↓ select · Enter spawn · Esc close';
    hint.style.cssText = 'color:#999;font-size:11px;margin-top:6px;text-align:center';
    panel.appendChild(hint);

    el.appendChild(panel);
    this.refreshHighlight();
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'F1') {
      e.preventDefault(); // suppress browser help
      this.toggle();
      return;
    }
    if (!this.visible) {
      return;
    }
    if (e.code === 'Escape') {
      e.preventDefault();
      this.close();
      return;
    }
    if (e.code === 'ArrowDown' || e.code === 'ArrowRight') {
      e.preventDefault();
      this.setHighlight((this.highlight + 1) % MOB_LABELS.length);
      return;
    }
    if (e.code === 'ArrowUp' || e.code === 'ArrowLeft') {
      e.preventDefault();
      this.setHighlight((this.highlight - 1 + MOB_LABELS.length) % MOB_LABELS.length);
      return;
    }
    if (e.code === 'Enter') {
      e.preventDefault();
      const entry = MOB_LABELS[this.highlight];
      if (entry) this.select(entry.type);
      return;
    }
    const digit = e.code.startsWith('Digit') ? Number(e.code.slice(5)) : NaN;
    if (digit >= 1 && digit <= MOB_LABELS.length) {
      e.preventDefault();
      const entry = MOB_LABELS[digit - 1];
      if (entry) this.select(entry.type);
    }
  };

  private setHighlight(index: number): void {
    this.highlight = index;
    this.refreshHighlight();
  }

  private refreshHighlight(): void {
    this.buttons.forEach((button, index) => {
      button.style.background = index === this.highlight ? '#5a7a3a' : '#333';
      button.style.borderColor = index === this.highlight ? '#9c6' : '#666';
    });
  }

  private select(type: MobType): void {
    this.onSelect(type);
    this.close();
  }

  public mount(): void {
    document.body.appendChild(this.element);
  }

  public toggle(): void {
    if (this.visible) {
      this.close();
    } else {
      this.open();
    }
  }

  public open(): void {
    this.visible = true;
    this.element.style.display = 'flex';
    // Release pointer lock so the cursor can drive the menu.
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  public close(): void {
    this.visible = false;
    this.element.style.display = 'none';
  }

  public isOpen(): boolean {
    return this.visible;
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    this.element.remove();
  }
}
