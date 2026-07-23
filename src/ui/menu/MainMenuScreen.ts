import { applyDirtBackground, guiHeight, guiWidth, GuiButton, Screen } from './MenuWidgets';

export interface MainMenuActions { readonly singleplayer: () => void; readonly options: () => void; readonly quit: () => void; }

export class MainMenuScreen extends Screen {
  private readonly logo = document.createElement('img');
  private readonly buttons: GuiButton[];
  public constructor(actions: MainMenuActions) {
    super(); applyDirtBackground(this.root);
    const version=document.createElement('div'); version.textContent='Minecraft Beta 1.7.3'; version.style.cssText='position:absolute;left:4px;top:4px;color:#888;font:10px Minecraft, monospace';
    this.logo.src='/textures/gui/minecraft_title_logo.png'; this.logo.draggable=false; this.logo.style.cssText='position:absolute;width:256px;height:64px;image-rendering:pixelated';
    this.buttons=[new GuiButton('Singleplayer',actions.singleplayer,200,20),new GuiButton('Options...',actions.options,200,20),new GuiButton('Quit Game',actions.quit,200,20)];
    this.root.append(version,this.logo,...this.buttons.map(b=>b.element));
    this.layout();
  }
  protected override onResize(): void { this.layout(); }
  private layout(): void {
    const w=guiWidth(), h=guiHeight(), x=w/2-100, y=Math.max(120, h/4+48);
    this.logo.style.left=`${Math.floor(w/2-128)}px`; this.logo.style.top='30px';
    this.buttons[0]!.setPosition(x,y); this.buttons[1]!.setPosition(x,y+36); this.buttons[2]!.setPosition(x,y+72);
  }
}
