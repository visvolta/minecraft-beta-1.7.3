/**
 * Simple panorama picker that cycles registered panorama definitions.
 */

import { applyDirtBackground, guiWidth, GuiButton, Screen } from './MenuWidgets';
import { PANORAMA_REGISTRY } from './PanoramaRegistry';

export class PanoramaPickerScreen extends Screen {
  private currentId = 'default';
  private label: HTMLDivElement;

  public constructor(private readonly onDone: (selectedId: string) => void) {
    super();
    applyDirtBackground(this.root);

    const title = document.createElement('div');
    title.textContent = 'Panorama';
    title.style.cssText = 'position:absolute;left:0;right:0;top:20px;text-align:center;font:18px Minecraft;color:white';

    this.label = document.createElement('div');
    this.label.textContent = 'Panorama: Default';
    this.label.style.cssText = 'position:absolute;left:0;right:0;top:80px;text-align:center;font:16px Minecraft;color:white';

    const cycleBtn = new GuiButton('Next Panorama', () => this.cycle(), 200, 20);
    const doneBtn = new GuiButton('Done', () => this.onDone(this.currentId), 200, 20);

    this.root.append(title, this.label, cycleBtn.element, doneBtn.element);
    this.layout();
  }

  protected override onResize(): void {
    this.layout();
  }

  private cycle(): void {
    const ids = PANORAMA_REGISTRY.listIds();
    if (ids.length <= 1) return;
    const idx = ids.indexOf(this.currentId);
    this.currentId = ids[(idx + 1) % ids.length] ?? 'default';
    this.label.textContent = 'Panorama: ' + this.currentId;
  }

  private layout(): void {
    const w = guiWidth();
    const x = w / 2 - 100;
    const btns = Array.from(this.root.querySelectorAll('.gui-button'));
    btns.forEach((btn, i) => {
      (btn as HTMLElement).style.position = 'absolute';
      (btn as HTMLElement).style.left = `${x}px`;
      (btn as HTMLElement).style.top = `${140 + i * 36}px`;
    });
  }
}
