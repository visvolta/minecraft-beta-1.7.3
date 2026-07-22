import { applyDirtBackground, GuiButton, Screen } from './MenuWidgets';

export interface MainMenuActions { readonly singleplayer: () => void; readonly options: () => void; readonly quit: () => void; }

export class MainMenuScreen extends Screen {
  public constructor(actions: MainMenuActions) {
    super(); applyDirtBackground(this.root);
    const version=document.createElement('div'); version.textContent='Minecraft Beta 1.7.3'; version.style.cssText='position:absolute;left:4px;top:4px;color:#888;font:14px monospace';
    const logo=document.createElement('img'); logo.src='/textures/gui/minecraft_title_logo.png'; logo.draggable=false; logo.style.cssText='position:absolute;left:50%;top:40px;width:512px;height:128px;transform:translateX(-50%);image-rendering:pixelated';
    const buttons=[new GuiButton('Singleplayer',actions.singleplayer,200),new GuiButton('Options...',actions.options,200),new GuiButton('Quit Game',actions.quit,200)];
    const x=window.innerWidth/2-100; buttons[0]!.setPosition(x,215); buttons[1]!.setPosition(x,245); buttons[2]!.setPosition(x,285);
    const copyright=document.createElement('div'); copyright.textContent='Copyright Mojang AB. Do not distribute.'; copyright.style.cssText='position:absolute;right:4px;bottom:4px;color:white;font:14px monospace';
    this.root.append(version,logo,...buttons.map(b=>b.element),copyright);
  }
}
