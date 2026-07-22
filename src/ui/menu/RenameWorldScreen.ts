import { applyDirtBackground, GuiButton, Screen, TextBox } from './MenuWidgets';

export class RenameWorldScreen extends Screen {
  public constructor(currentName: string, save: (name: string) => void, cancel: () => void) {
    super(); applyDirtBackground(this.root);
    const title=document.createElement('div'); title.textContent='Rename World'; title.style.cssText='position:absolute;left:0;right:0;top:80px;text-align:center;font:22px monospace;color:white';
    const box=new TextBox(currentName); box.setPosition(window.innerWidth/2-150,135,300);
    const done=new GuiButton('Save',()=>{const value=box.value.trim(); if(value.length>0) save(value);},160); done.setPosition(window.innerWidth/2-170,190);
    const back=new GuiButton('Cancel',cancel,160); back.setPosition(window.innerWidth/2+10,190);
    this.root.append(title,box.element,done.element,back.element); setTimeout(()=>box.element.focus(),0);
  }
}
