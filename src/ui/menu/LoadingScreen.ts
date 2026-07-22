import { progressRatio, type LoadingProgress } from '../../app/LoadingProgress';
import { applyDirtBackground, Screen } from './MenuWidgets';

export class LoadingScreen extends Screen {
  private readonly title = document.createElement('div');
  private readonly detail = document.createElement('div');
  private readonly bar = document.createElement('div');
  private readonly fill = document.createElement('div');
  public constructor() {
    super(); applyDirtBackground(this.root);
    this.title.style.cssText='position:absolute;left:0;right:0;top:40%;text-align:center;font:20px monospace;color:white;text-shadow:2px 2px #333';
    this.detail.style.cssText='position:absolute;left:0;right:0;top:calc(40% + 28px);text-align:center;font:14px monospace;color:#aaa';
    this.bar.style.cssText="position:absolute;left:50%;top:calc(40% + 56px);width:200px;height:10px;transform:translateX(-50%);background:url('/textures/gui/empty_loadingbar.png') 0 0 / 100% 100%;image-rendering:pixelated";
    this.fill.style.cssText="height:10px;width:0;background:url('/textures/gui/loadingbar_fill.png') 0 0 / 200px 10px;image-rendering:pixelated";
    this.bar.append(this.fill); this.root.append(this.title,this.detail,this.bar);
  }
  public update(progress: LoadingProgress): void { const ratio=progressRatio(progress); this.title.textContent=progress.primaryMessage; this.detail.textContent=progress.secondaryMessage??(ratio===undefined?'Working...':`${Math.floor(ratio*100)}%`); this.fill.style.width=ratio===undefined?'35%':`${Math.floor(ratio*200)}px`; }
}
