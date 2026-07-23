import { GuiButton, Screen } from './MenuWidgets';

export class PauseMenuScreen extends Screen {
  public constructor(actions: { readonly resume: () => void; readonly options: () => void; readonly saveQuit: () => void }) {
    super();
    this.root.style.background = 'rgba(0,0,0,0.55)';
    const title=document.createElement('div'); title.textContent='Game menu'; title.style.cssText='position:absolute;left:0;right:0;top:70px;text-align:center;font:24px Minecraft, monospace;color:white';
    const x=window.innerWidth/2-150;
    const resume=new GuiButton('Back to Game',actions.resume); resume.setPosition(x,130);
    const options=new GuiButton('Options...',actions.options); options.setPosition(x,178);
    const quit=new GuiButton('Save and Quit to Title',actions.saveQuit); quit.setPosition(x,226);
    this.root.append(title,resume.element,options.element,quit.element);
  }
}
