import { guiHeight, guiWidth, GuiButton, Screen } from './MenuWidgets';

export class PauseMenuScreen extends Screen {
  private readonly resume: GuiButton;
  private readonly options: GuiButton;
  private readonly quit: GuiButton;
  public constructor(actions: { readonly resume: () => void; readonly options: () => void; readonly saveQuit: () => void }) {
    super();
    this.root.style.background = 'rgba(0,0,0,0.55)';
    const title=document.createElement('div'); title.textContent='Game menu'; title.style.cssText='position:absolute;left:0;right:0;top:40px;text-align:center;font:18px Minecraft, monospace;color:white';
    this.resume=new GuiButton('Back to Game',actions.resume,200,20);
    this.options=new GuiButton('Options...',actions.options,200,20);
    this.quit=new GuiButton('Save and Quit to Title',() => {
      console.info('[SavePipelineTrace] save.ui.pause_menu_click', { label: 'Save and Quit to Title' });
      actions.saveQuit();
    },200,20);
    this.root.append(title,this.resume.element,this.options.element,this.quit.element); this.layout();
  }
  protected override onResize(): void { this.layout(); }
  private layout(): void { const x=guiWidth()/2-100,y=Math.max(80,guiHeight()/4+24); this.resume.setPosition(x,y); this.options.setPosition(x,y+24); this.quit.setPosition(x,y+48); }
}
