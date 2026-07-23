import { applyDirtBackground, guiWidth, GuiButton, Screen, TextBox } from './MenuWidgets';

export class RenameWorldScreen extends Screen {
  private readonly box: TextBox;
  private readonly done: GuiButton;
  private readonly back: GuiButton;
  public constructor(currentName: string, save: (name: string) => void, cancel: () => void) {
    super(); applyDirtBackground(this.root);
    const title=document.createElement('div'); title.textContent='Rename World'; title.style.cssText='position:absolute;left:0;right:0;top:70px;text-align:center;font:18px Minecraft, monospace;color:white';
    this.box=new TextBox(currentName);
    this.done=new GuiButton('Save',()=>{const value=this.box.value.trim(); if(value.length>0) save(value);},120,20);
    this.back=new GuiButton('Cancel',cancel,120,20);
    this.root.append(title,this.box.element,this.done.element,this.back.element); this.layout(); setTimeout(()=>this.box.element.focus(),0);
  }
  protected override onResize(): void { this.layout(); }
  private layout(): void { const w=guiWidth(); this.box.setPosition(w/2-100,110,200); this.done.setPosition(w/2-125,150); this.back.setPosition(w/2+5,150); }
}
