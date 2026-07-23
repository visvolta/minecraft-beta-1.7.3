import { applyDirtBackground, GuiButton, Screen } from './MenuWidgets';
import type { GameSettings } from '../../settings/GameSettings';

function pct(value: number): string { return `${Math.round(value * 100)}%`; }
function nextVolume(value: number): number { return value >= 1 ? 0 : Math.min(1, Math.round((value + 0.1) * 10) / 10); }

export class OptionsScreen extends Screen {
  public constructor(settings: GameSettings, actions: { readonly done: () => void; readonly video: () => void; readonly controls: () => void; readonly setSettings: (settings: GameSettings) => void }) {
    super(); applyDirtBackground(this.root);
    const title=document.createElement('div'); title.textContent='Options'; title.style.cssText='position:absolute;left:0;right:0;top:32px;text-align:center;font:24px Minecraft, monospace;color:white';
    const x1=window.innerWidth/2-310, x2=window.innerWidth/2+10, y=84;
    const master=new GuiButton(`Master Volume: ${pct(settings.audio.master)}`,()=>actions.setSettings({...settings,audio:{...settings.audio,master:nextVolume(settings.audio.master)}})); master.setPosition(x1,y);
    const music=new GuiButton(`Music: ${pct(settings.audio.music)}`,()=>actions.setSettings({...settings,audio:{...settings.audio,music:nextVolume(settings.audio.music)}})); music.setPosition(x2,y);
    const sound=new GuiButton(`Sound: ${pct(settings.audio.sound)}`,()=>actions.setSettings({...settings,audio:{...settings.audio,sound:nextVolume(settings.audio.sound)}})); sound.setPosition(x1,y+44);
    const sensitivity=new GuiButton(`Sensitivity: ${Math.round(settings.mouse.sensitivity*200)}%`,()=>{const next=(settings.mouse.sensitivity>=1?0:Math.min(1,settings.mouse.sensitivity+.1));actions.setSettings({...settings,mouse:{...settings.mouse,sensitivity:next}});}); sensitivity.setPosition(x2,y+44);
    const invert=new GuiButton(`Invert Mouse: ${settings.mouse.invertY?'ON':'OFF'}`,()=>actions.setSettings({...settings,mouse:{...settings.mouse,invertY:!settings.mouse.invertY}})); invert.setPosition(x1,y+88);
    const video=new GuiButton('Video Settings...',actions.video); video.setPosition(x2,y+88);
    const controls=new GuiButton('Controls...',actions.controls); controls.setPosition(x1,y+132);
    const done=new GuiButton('Done',actions.done); done.setPosition(window.innerWidth/2-150,window.innerHeight-72);
    this.root.append(title,master.element,music.element,sound.element,sensitivity.element,invert.element,video.element,controls.element,done.element);
  }
}
