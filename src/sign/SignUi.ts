export class SignUi {
  readonly root = typeof document !== 'undefined' ? document.createElement('div') : ({} as any);
  private windowEl = typeof document !== 'undefined' ? document.createElement('div') : ({} as any);
  private inputs: HTMLInputElement[] = [];

  private onConfirm?: (lines: string[]) => void;
  private onCancel?: () => void;

  public constructor() {
    if (typeof document === 'undefined') return;
    this.root.id = 'sign-modal-root';
    this.root.style.position = 'fixed';
    this.root.style.inset = '0';
    this.root.style.zIndex = '1000';
    this.root.style.background = 'rgba(0, 0, 0, 0.6)';
    this.root.style.display = 'none';
    this.root.style.pointerEvents = 'auto';
    this.root.style.userSelect = 'none';
    this.root.style.display = 'flex';
    this.root.style.justifyContent = 'center';
    this.root.style.alignItems = 'center';
    this.root.style.flexDirection = 'column';

    const title = document.createElement('div');
    title.innerText = 'Edit sign message';
    title.style.color = '#fff';
    title.style.fontFamily = 'monospace';
    title.style.fontSize = '20px';
    title.style.marginBottom = '20px';

    this.windowEl.className = 'sign-window';
    this.windowEl.style.width = '300px';
    this.windowEl.style.height = '150px';
    this.windowEl.style.background = '#8B6B4A'; // Wood color approx
    this.windowEl.style.border = '4px solid #5A4027';
    this.windowEl.style.display = 'flex';
    this.windowEl.style.flexDirection = 'column';
    this.windowEl.style.padding = '10px';
    this.windowEl.style.boxSizing = 'border-box';

    for (let i = 0; i < 4; i++) {
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 15;
      input.style.width = '100%';
      input.style.height = '25%';
      input.style.background = 'transparent';
      input.style.border = 'none';
      input.style.outline = 'none';
      input.style.textAlign = 'center';
      input.style.fontFamily = 'monospace';
      input.style.fontSize = '20px';
      input.style.color = '#000';
      this.inputs.push(input);
      this.windowEl.appendChild(input);

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (i < 3) {
            this.inputs[i + 1]!.focus();
          } else {
            this.confirm();
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this.cancel();
        }
      });
    }

    const help = document.createElement('div');
    help.innerText = 'Press ENTER to save, ESC to cancel';
    help.style.color = '#ccc';
    help.style.fontFamily = 'monospace';
    help.style.fontSize = '12px';
    help.style.marginTop = '20px';

    this.root.appendChild(title);
    this.root.appendChild(this.windowEl);
    this.root.appendChild(help);
    document.body.appendChild(this.root);

    // Initial hide
    this.root.style.display = 'none';
  }

  public setOnConfirm(cb: (lines: string[]) => void): void { this.onConfirm = cb; }
  public setOnCancel(cb: () => void): void { this.onCancel = cb; }

  public show(lines: string[]): void {
    if (typeof document === 'undefined') return;
    for (let i = 0; i < 4; i++) {
      this.inputs[i]!.value = lines[i] || '';
    }
    this.root.style.display = 'flex';
    setTimeout(() => this.inputs[0]!.focus(), 10);
  }

  public hide(): void {
    if (typeof document === 'undefined') return;
    this.root.style.display = 'none';
  }

  private confirm(): void {
    const lines = this.inputs.map(i => i.value);
    this.onConfirm?.(lines);
  }

  private cancel(): void {
    this.onCancel?.();
  }
}
