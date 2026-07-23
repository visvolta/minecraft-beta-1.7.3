import { applyGuiScaleCssVariables, computeGuiScale, logicalHeight, logicalWidth } from '../GuiScale';

const GUI = '/textures/gui/';
export const BUTTON_PRIMARY = { width: 300, height: 36 } as const;
export const BUTTON_SECONDARY = { width: 220, height: 32 } as const;
export const BUTTON_COMPACT = { width: 150, height: 28 } as const;

export function guiWidth(): number { return logicalWidth(); }
export function guiHeight(): number { return logicalHeight(); }
export function guiScale(): number { return computeGuiScale(); }

export abstract class Screen {
  public readonly root = document.createElement('div');
  private mounted = false;
  private readonly resizeHandler = (): void => this.resize();
  protected constructor() {
    this.root.style.cssText = 'position:fixed;left:0;top:0;z-index:2000;image-rendering:pixelated;font-family:Minecraft, monospace;color:white;user-select:none;transform-origin:top left;overflow:hidden';
    this.resize();
  }
  public mount(parent = document.body): void { this.mounted = true; parent.append(this.root); window.addEventListener('resize', this.resizeHandler); this.resize(); }
  public dispose(): void { this.mounted = false; window.removeEventListener('resize', this.resizeHandler); this.root.remove(); }
  protected onResize(): void {}
  private resize(): void {
    applyGuiScaleCssVariables();
    const scale = guiScale();
    this.root.style.width = `${guiWidth()}px`;
    this.root.style.height = `${guiHeight()}px`;
    this.root.style.transform = `scale(${scale})`;
    if (this.mounted) this.onResize();
  }
}

export class GuiButton {
  public readonly element = document.createElement('button');
  private readonly width: number;
  public constructor(label: string, onClick: () => void, width: number = BUTTON_PRIMARY.width, height: number = BUTTON_PRIMARY.height) {
    this.width = width;
    this.element.textContent = label;
    this.element.style.cssText = `position:absolute;width:${width}px;height:${height}px;border:0;padding:0;background:url('${GUI}button_normal.png') 0 0 / 100% 100%;color:white;font:18px Minecraft, monospace;text-shadow:2px 2px #333;image-rendering:pixelated;cursor:pointer`;
    this.element.addEventListener('mouseenter', () => { if (!this.element.disabled) this.element.style.backgroundImage = `url('${GUI}button_highlighted.png')`; });
    this.element.addEventListener('mouseleave', () => { if (!this.element.disabled) this.element.style.backgroundImage = `url('${GUI}button_normal.png')`; });
    this.element.addEventListener('mousedown', () => { if (!this.element.disabled) this.element.style.backgroundImage = `url('${GUI}button_clicked.png')`; });
    this.element.addEventListener('mouseup', () => { if (!this.element.disabled) this.element.style.backgroundImage = `url('${GUI}button_highlighted.png')`; });
    this.element.addEventListener('click', (event) => { event.preventDefault(); if (!this.element.disabled) { window.dispatchEvent(new CustomEvent('mc-ui-click')); onClick(); } });
  }
  public setPosition(x: number, y: number): void { this.element.style.left = `${Math.floor(x)}px`; this.element.style.top = `${Math.floor(y)}px`; }
  public centerAt(x: number, y: number): void { this.setPosition(x - this.width / 2, y); }
  public setDisabled(disabled: boolean): void { this.element.disabled = disabled; this.element.style.backgroundImage = `url('${GUI}${disabled ? 'button_disabled' : 'button_normal'}.png')`; this.element.style.color = disabled ? '#a0a0a0' : 'white'; }
}

export class TextBox {
  public readonly element = document.createElement('input');
  public constructor(value = '') { this.element.value = value; this.element.style.cssText = 'position:absolute;background:#000;border:2px solid #a0a0a0;color:white;font:18px Minecraft, monospace;height:30px;box-sizing:border-box;padding:2px 4px'; }
  public setPosition(x: number, y: number, w: number): void { this.element.style.left = `${x}px`; this.element.style.top = `${y}px`; this.element.style.width = `${w}px`; }
  public get value(): string { return this.element.value; }
  public set value(value: string) { this.element.value = value; }
}

export function applyDirtBackground(element: HTMLElement): void {
  element.style.backgroundColor = '#080604';
  element.style.backgroundImage = `linear-gradient(rgba(0,0,0,.38),rgba(0,0,0,.38)), url('${GUI}menu_BG.png')`;
  element.style.backgroundRepeat = 'repeat, repeat';
  element.style.backgroundSize = 'auto, 64px 64px';
  element.style.imageRendering = 'pixelated';
}
