import { applyDirtBackground, GuiButton, Screen } from './MenuWidgets';

export interface MainMenuActions { readonly singleplayer: () => void; readonly options: () => void; readonly quit: () => void; }

export class MainMenuScreen extends Screen {
  public constructor(actions: MainMenuActions) {
    super(); applyDirtBackground(this.root);
    const version=document.createElement('div'); version.textContent='Minecraft Beta 1.7.3'; version.style.cssText='position:absolute;left:4px;top:4px;color:#888;font:14px Minecraft, monospace';
    const logo=document.createElement('img'); logo.src='/textures/gui/minecraft_title_logo.png'; logo.draggable=false; logo.style.cssText='position:absolute;left:50%;top:36px;width:512px;height:128px;transform:translateX(-50%);image-rendering:pixelated';
    const buttons=[new GuiButton('Singleplayer',actions.singleplayer),new GuiButton('Options...',actions.options),new GuiButton('Quit Game',actions.quit)];
    const x=window.innerWidth/2-150; buttons[0]!.setPosition(x,215); buttons[1]!.setPosition(x,260); buttons[2]!.setPosition(x,305);
    this.root.append(version,logo,...buttons.map(b=>b.element));
  }
}
