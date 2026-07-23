import { progressRatio, type LoadingProgress } from '../../app/LoadingProgress';
import { applyDirtBackground, guiHeight, guiWidth, Screen } from './MenuWidgets';

export class LoadingScreen extends Screen {
  private readonly title = document.createElement('div');
  private readonly detail = document.createElement('div');
  private readonly bar = document.createElement('div');
  private readonly fill = document.createElement('div');
  public constructor() {
    super(); applyDirtBackground(this.root);
    this.title.style.cssText='position:absolute;left:0;right:0;text-align:center;font:16px Minecraft, monospace;color:white;text-shadow:2px 2px #333';
    this.detail.style.cssText='position:absolute;left:0;right:0;text-align:center;font:11px Minecraft, monospace;color:#aaa';
    this.bar.style.cssText="position:absolute;width:200px;height:10px;background:url('/textures/gui/empty_loadingbar.png') 0 0 / 100% 100%;image-rendering:pixelated";
    this.fill.style.cssText="height:10px;width:0;background:url('/textures/gui/loadingbar_fill.png') 0 0 / 200px 10px;image-rendering:pixelated";
    this.bar.append(this.fill); this.root.append(this.title,this.detail,this.bar); this.layout();
  }
  protected override onResize(): void { this.layout(); }
  private layout(): void { const w=guiWidth(), h=guiHeight(), y=Math.floor(h*0.4); this.title.style.top=`${y}px`; this.detail.style.top=`${y+24}px`; this.bar.style.left=`${Math.floor(w/2-100)}px`; this.bar.style.top=`${y+50}px`; }
  public update(progress: LoadingProgress): void { const ratio=progressRatio(progress); this.title.textContent=progress.primaryMessage; this.detail.textContent=progress.secondaryMessage??(ratio===undefined?'Working...':`${Math.floor(ratio*100)}%`); this.fill.style.width=ratio===undefined?'35%':`${Math.floor(ratio*200)}px`; }
}
