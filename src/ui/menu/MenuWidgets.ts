const GUI = '/textures/gui/';

export abstract class Screen {
  public readonly root = document.createElement('div');
  protected constructor() {
    this.root.style.cssText = `position:fixed;inset:0;z-index:2000;image-rendering:pixelated;font-family:monospace;color:white;user-select:none`;
  }
  public mount(parent = document.body): void { parent.append(this.root); }
  public dispose(): void { this.root.remove(); }
}

export class GuiButton {
  public readonly element = document.createElement('button');
  public constructor(label: string, onClick: () => void, width = 200, height = 20) {
    this.element.textContent = label;
    this.element.style.cssText = `position:absolute;width:${width}px;height:${height}px;border:0;padding:0;background:url('${GUI}button_normal.png') 0 0 / 100% 100%;color:white;font:16px monospace;text-shadow:2px 2px #333;image-rendering:pixelated;cursor:pointer`;
    this.element.addEventListener('mouseenter', () => { if (!this.element.disabled) this.element.style.backgroundImage = `url('${GUI}button_highlighted.png')`; });
    this.element.addEventListener('mouseleave', () => { if (!this.element.disabled) this.element.style.backgroundImage = `url('${GUI}button_normal.png')`; });
    this.element.addEventListener('mousedown', () => { if (!this.element.disabled) this.element.style.backgroundImage = `url('${GUI}button_clicked.png')`; });
    this.element.addEventListener('mouseup', () => { if (!this.element.disabled) this.element.style.backgroundImage = `url('${GUI}button_highlighted.png')`; });
    this.element.addEventListener('click', (event) => { event.preventDefault(); if (!this.element.disabled) onClick(); });
  }
  public setPosition(x: number, y: number): void { this.element.style.left = `${x}px`; this.element.style.top = `${y}px`; }
  public setDisabled(disabled: boolean): void { this.element.disabled = disabled; this.element.style.backgroundImage = `url('${GUI}${disabled ? 'button_disabled' : 'button_normal'}.png')`; this.element.style.color = disabled ? '#a0a0a0' : 'white'; }
}

export class TextBox {
  public readonly element = document.createElement('input');
  public constructor(value = '') { this.element.value = value; this.element.style.cssText = 'position:absolute;background:#000;border:2px solid #a0a0a0;color:white;font:16px monospace;height:24px;box-sizing:border-box;padding:2px 4px'; }
  public setPosition(x: number, y: number, w: number): void { this.element.style.left = `${x}px`; this.element.style.top = `${y}px`; this.element.style.width = `${w}px`; }
  public get value(): string { return this.element.value; }
  public set value(value: string) { this.element.value = value; }
}

export function applyDirtBackground(element: HTMLElement): void {
  element.style.background = `#201912 url('${GUI}menu_BG.png') repeat`;
  element.style.imageRendering = 'pixelated';
}
