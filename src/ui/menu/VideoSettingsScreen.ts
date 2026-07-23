import { applyDirtBackground, guiHeight, guiWidth, GuiButton, Screen } from './MenuWidgets';
import type { GameSettings } from '../../settings/GameSettings';
import { guiScaleLabel, nextGuiScale } from '../GuiScale';

export class VideoSettingsScreen extends Screen {
  private settings: GameSettings;
  private readonly viewBob: GuiButton;
  private readonly guiScaleButton: GuiButton;
  private readonly back: GuiButton;
  public constructor(settings: GameSettings, private readonly setSettings: (settings: GameSettings) => void, done: () => void) {
    super(); applyDirtBackground(this.root); this.settings = settings;
    const title=document.createElement('div'); title.textContent='Video Settings'; title.style.cssText='position:absolute;left:0;right:0;top:20px;text-align:center;font:18px Minecraft, monospace;color:white';
    this.viewBob=new GuiButton('',()=>this.update({...this.settings,video:{...this.settings.video,viewBobbing:!this.settings.video.viewBobbing}}),150,20);
    this.guiScaleButton=new GuiButton('',()=>this.update({...this.settings,video:{...this.settings.video,guiScale:nextGuiScale(this.settings.video.guiScale)}}),150,20);
    this.back=new GuiButton('Done',done,200,20);
    this.root.append(title,this.viewBob.element,this.guiScaleButton.element,this.back.element); this.refreshLabels(); this.layout();
  }
  protected override onResize(): void { this.layout(); }
  private update(settings: GameSettings): void { this.settings = settings; this.setSettings(settings); this.refreshLabels(); }
  private refreshLabels(): void { this.viewBob.element.textContent=`View Bobbing: ${this.settings.video.viewBobbing?'ON':'OFF'}`; this.guiScaleButton.element.textContent=`GUI Scale: ${guiScaleLabel(this.settings.video.guiScale)}`; }
  private layout(): void { const w=guiWidth(),h=guiHeight(); this.viewBob.setPosition(w/2-155,70); this.guiScaleButton.setPosition(w/2+5,70); this.back.setPosition(w/2-100,h-40); }
}
