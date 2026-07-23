import { applyDirtBackground, GuiButton, Screen } from './MenuWidgets';
import type { GameSettings } from '../../settings/GameSettings';

export class OptionsScreen extends Screen {
  public constructor(settings: GameSettings, actions: { readonly done: () => void; readonly video: () => void; readonly controls: () => void; readonly setSettings: (settings: GameSettings) => void }) {
    super(); applyDirtBackground(this.root);
    const title=document.createElement('div'); title.textContent='Options'; title.style.cssText='position:absolute;left:0;right:0;top:32px;text-align:center;font:24px Minecraft, monospace;color:white';
    const x1=window.innerWidth/2-310, x2=window.innerWidth/2+10, y=90;
    const sensitivity=new GuiButton(`Sensitivity: ${Math.round(settings.mouse.sensitivity*200)}%`,()=>{const next=(settings.mouse.sensitivity>=1?0:Math.min(1,settings.mouse.sensitivity+.1));actions.setSettings({...settings,mouse:{...settings.mouse,sensitivity:next}});}); sensitivity.setPosition(x1,y);
    const invert=new GuiButton(`Invert Mouse: ${settings.mouse.invertY?'ON':'OFF'}`,()=>actions.setSettings({...settings,mouse:{...settings.mouse,invertY:!settings.mouse.invertY}})); invert.setPosition(x2,y);
    const video=new GuiButton('Video Settings...',actions.video); video.setPosition(x1,y+48);
    const controls=new GuiButton('Controls...',actions.controls); controls.setPosition(x2,y+48);
    const done=new GuiButton('Done',actions.done); done.setPosition(window.innerWidth/2-150,window.innerHeight-72);
    this.root.append(title,sensitivity.element,invert.element,video.element,controls.element,done.element);
  }
}
