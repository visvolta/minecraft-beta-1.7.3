import { progressRatio, type LoadingProgress } from '../../app/LoadingProgress';
import { applyDirtBackground, guiHeight, guiWidth, Screen } from './MenuWidgets';

export class LoadingScreen extends Screen {
  private readonly title = document.createElement('div');
  private readonly detail = document.createElement('div');
  private readonly bar = document.createElement('div');
  private readonly fill = document.createElement('div');
  public constructor() {
    super(); applyDirtBackground(this.root);
    this.title.style.cssText='position:absolute;left:0;right:0;text-align:center;font:16px Minecraft;color:white;text-shadow:2px 2px #333';
    this.detail.style.cssText='position:absolute;left:0;right:0;text-align:center;font:11px Minecraft;color:#aaa';
    this.bar.style.cssText="position:absolute;width:200px;height:10px;background:url('/textures/gui/empty_loadingbar.png') 0 0 / 100% 100%;image-rendering:pixelated";
    this.fill.style.cssText="height:10px;width:0;background:url('/textures/gui/loadingbar_fill.png') 0 0 / 200px 10px;image-rendering:pixelated";
    this.bar.append(this.fill); this.root.append(this.title,this.detail,this.bar); this.layout();
  }
  protected override onResize(): void { this.layout(); }
  private layout(): void { const w=guiWidth(), h=guiHeight(), y=Math.floor(h*0.4); this.title.style.top=`${y}px`; this.detail.style.top=`${y+24}px`; this.bar.style.left=`${Math.floor(w/2-100)}px`; this.bar.style.top=`${y+50}px`; }
  /**
   * Shows real progress only.
   *
   * When no ratio is measurable the bar renders an indeterminate sweep and the
   * detail line stays blank rather than displaying an invented percentage (the
   * old code hardcoded a 35% fill, which implied progress that did not exist).
   */
  public update(progress: LoadingProgress): void {
    const ratio = progressRatio(progress);
    this.title.textContent = progress.primaryMessage;
    const measured = ratio !== undefined;
    this.detail.textContent = progress.secondaryMessage ?? (measured ? `${Math.floor(ratio * 100)}%` : '');
    this.bar.classList.toggle('loading-indeterminate', !measured);
    this.fill.style.width = measured ? `${Math.floor(ratio * 200)}px` : '';
  }
}
