import { applyDirtBackground, GuiButton, Screen } from './MenuWidgets';

export class ConfirmDeleteScreen extends Screen {
  public constructor(worldName: string, confirm: () => void, cancel: () => void) {
    super(); applyDirtBackground(this.root);
    const title=document.createElement('div'); title.textContent='Delete World'; title.style.cssText='position:absolute;left:0;right:0;top:90px;text-align:center;font:22px monospace;color:white';
    const msg=document.createElement('div'); msg.textContent=`Are you sure you want to delete "${worldName}"?`; msg.style.cssText='position:absolute;left:0;right:0;top:140px;text-align:center;font:16px monospace;color:#ddd';
    const yes=new GuiButton('Delete',confirm,160); yes.setPosition(window.innerWidth/2-170,200); const no=new GuiButton('Cancel',cancel,160); no.setPosition(window.innerWidth/2+10,200);
    this.root.append(title,msg,yes.element,no.element);
  }
}
