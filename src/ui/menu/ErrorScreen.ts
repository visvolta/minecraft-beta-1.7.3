import { applyDirtBackground, GuiButton, Screen } from './MenuWidgets';

export class ErrorScreen extends Screen {
  public constructor(titleText: string, messageText: string, back: () => void) {
    super(); applyDirtBackground(this.root);
    const title=document.createElement('div'); title.textContent=titleText; title.style.cssText='position:absolute;left:0;right:0;top:90px;text-align:center;font:24px Minecraft, monospace;color:white';
    const msg=document.createElement('div'); msg.textContent=messageText; msg.style.cssText='position:absolute;left:10%;right:10%;top:140px;text-align:center;color:#ff8080;font:16px Minecraft, monospace';
    const btn=new GuiButton('Back',back); btn.setPosition(window.innerWidth/2-150,210);
    this.root.append(title,msg,btn.element);
  }
}
