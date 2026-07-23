import { applyDirtBackground, guiWidth, GuiButton, Screen } from './MenuWidgets';

export class ErrorScreen extends Screen {
  private readonly btn: GuiButton;
  public constructor(titleText: string, messageText: string, back: () => void) {
    super(); applyDirtBackground(this.root);
    const title=document.createElement('div'); title.textContent=titleText; title.style.cssText='position:absolute;left:0;right:0;top:70px;text-align:center;font:18px Minecraft, monospace;color:white';
    const msg=document.createElement('div'); msg.textContent=messageText; msg.style.cssText='position:absolute;left:10%;right:10%;top:110px;text-align:center;color:#ff8080;font:12px Minecraft, monospace';
    this.btn=new GuiButton('Back',back,200,20);
    this.root.append(title,msg,this.btn.element); this.layout();
  }
  protected override onResize(): void { this.layout(); }
  private layout(): void { this.btn.setPosition(guiWidth()/2-100,160); }
}
