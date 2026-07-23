import { applyDirtBackground, guiWidth, GuiButton, Screen } from './MenuWidgets';

export class ConfirmDeleteScreen extends Screen {
  private readonly yes: GuiButton;
  private readonly no: GuiButton;
  public constructor(worldName: string, confirm: () => void, cancel: () => void) {
    super(); applyDirtBackground(this.root);
    const title=document.createElement('div'); title.textContent='Delete World'; title.style.cssText='position:absolute;left:0;right:0;top:70px;text-align:center;font:18px Minecraft, monospace;color:white';
    const msg=document.createElement('div'); msg.textContent=`Are you sure you want to delete "${worldName}"?`; msg.style.cssText='position:absolute;left:10px;right:10px;top:110px;text-align:center;font:12px Minecraft, monospace;color:#ddd';
    this.yes=new GuiButton('Delete',confirm,120,20); this.no=new GuiButton('Cancel',cancel,120,20);
    this.root.append(title,msg,this.yes.element,this.no.element); this.layout();
  }
  protected override onResize(): void { this.layout(); }
  private layout(): void { const w=guiWidth(); this.yes.setPosition(w/2-125,150); this.no.setPosition(w/2+5,150); }
}
