import { applyDirtBackground, guiHeight, guiWidth, GuiButton, Screen } from './MenuWidgets';
import type { GameSettings } from '../../settings/GameSettings';

function pct(value: number): string { return `${Math.round(value * 100)}%`; }
function nextVolume(value: number): number { return value >= 1 ? 0 : Math.min(1, Math.round((value + 0.1) * 10) / 10); }

export class OptionsScreen extends Screen {
  private settings: GameSettings;
  private readonly master: GuiButton;
  private readonly music: GuiButton;
  private readonly sound: GuiButton;
  private readonly sensitivity: GuiButton;
  private readonly invert: GuiButton;
  private readonly video: GuiButton;
  private readonly controls: GuiButton;
  private readonly done: GuiButton;
  private readonly buttons: GuiButton[];

  public constructor(settings: GameSettings, private readonly actions: { readonly done: () => void; readonly video: () => void; readonly controls: () => void; readonly setSettings: (settings: GameSettings) => void }) {
    super(); applyDirtBackground(this.root); this.settings = settings;
    const title=document.createElement('div'); title.textContent='Options'; title.style.cssText='position:absolute;left:0;right:0;top:20px;text-align:center;font:18px Minecraft, monospace;color:white';
    this.master=new GuiButton('',()=>this.update({...this.settings,audio:{...this.settings.audio,master:nextVolume(this.settings.audio.master)}}),150,20);
    this.music=new GuiButton('',()=>this.update({...this.settings,audio:{...this.settings.audio,music:nextVolume(this.settings.audio.music)}}),150,20);
    this.sound=new GuiButton('',()=>this.update({...this.settings,audio:{...this.settings.audio,sound:nextVolume(this.settings.audio.sound)}}),150,20);
    this.sensitivity=new GuiButton('',()=>{const next=(this.settings.mouse.sensitivity>=1?0:Math.min(1,this.settings.mouse.sensitivity+.1));this.update({...this.settings,mouse:{...this.settings.mouse,sensitivity:next}});},150,20);
    this.invert=new GuiButton('',()=>this.update({...this.settings,mouse:{...this.settings.mouse,invertY:!this.settings.mouse.invertY}}),150,20);
    this.video=new GuiButton('Video Settings...',this.actions.video,150,20);
    this.controls=new GuiButton('Controls...',this.actions.controls,150,20);
    this.done=new GuiButton('Done',this.actions.done,200,20);
    this.buttons=[this.master,this.music,this.sound,this.sensitivity,this.invert,this.video,this.controls,this.done];
    this.root.append(title,...this.buttons.map(b=>b.element)); this.refreshLabels(); this.layout();
  }
  protected override onResize(): void { this.layout(); }
  private update(settings: GameSettings): void { this.settings = settings; this.actions.setSettings(settings); this.refreshLabels(); }
  private refreshLabels(): void {
    this.master.element.textContent=`Master Volume: ${pct(this.settings.audio.master)}`;
    this.music.element.textContent=`Music: ${pct(this.settings.audio.music)}`;
    this.sound.element.textContent=`Sound: ${pct(this.settings.audio.sound)}`;
    this.sensitivity.element.textContent=`Sensitivity: ${Math.round(this.settings.mouse.sensitivity*200)}%`;
    this.invert.element.textContent=`Invert Mouse: ${this.settings.mouse.invertY?'ON':'OFF'}`;
  }
  private layout(): void { const w=guiWidth(),h=guiHeight(),x1=w/2-155,x2=w/2+5,y=58;for(let i=0;i<7;i++){this.buttons[i]!.setPosition(i%2===0?x1:x2,y+Math.floor(i/2)*24);}this.done.setPosition(w/2-100,h-40); }
}
