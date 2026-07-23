import { applyDirtBackground, GuiButton, Screen } from './MenuWidgets';
import type { GameSettings } from '../../settings/GameSettings';

export class VideoSettingsScreen extends Screen {
  public constructor(settings: GameSettings, setSettings: (settings: GameSettings) => void, done: () => void) {
    super(); applyDirtBackground(this.root);
    const title=document.createElement('div'); title.textContent='Video Settings'; title.style.cssText='position:absolute;left:0;right:0;top:32px;text-align:center;font:24px Minecraft, monospace;color:white';
    const viewBob=new GuiButton(`View Bobbing: ${settings.video.viewBobbing?'ON':'OFF'}`,()=>setSettings({...settings,video:{...settings.video,viewBobbing:!settings.video.viewBobbing}})); viewBob.setPosition(window.innerWidth/2-150,110);
    const back=new GuiButton('Done',done); back.setPosition(window.innerWidth/2-150,window.innerHeight-72);
    this.root.append(title,viewBob.element,back.element);
  }
}
