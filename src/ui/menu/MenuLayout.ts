export interface Rect { readonly x: number; readonly y: number; readonly width: number; readonly height: number; }

export class MenuLayout {
  public constructor(public readonly width = window.innerWidth, public readonly height = window.innerHeight) {}
  public get scale(): number { return Math.max(2, Math.floor(Math.min(this.width / 427, this.height / 240))); }
  public centerRect(width: number, height: number, yOffset = 0): Rect { return { x: Math.floor((this.width - width) / 2), y: Math.floor((this.height - height) / 2 + yOffset), width, height }; }
  public centerX(width: number): number { return Math.floor((this.width - width) / 2); }
}
