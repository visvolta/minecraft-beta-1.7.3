import { applyDirtBackground, GuiButton, Screen } from './MenuWidgets';

export class OptionsScreen extends Screen {
  public constructor(back: () => void) {
    super(); applyDirtBackground(this.root);
    const title=document.createElement('div'); title.textContent='Options'; title.style.cssText='position:absolute;left:0;right:0;top:20px;text-align:center;font:18px monospace;color:white';
    const note=document.createElement('div'); note.textContent='Options are not yet configurable in this stage.'; note.style.cssText='position:absolute;left:0;right:0;top:100px;text-align:center;color:#aaa;font:14px monospace';
    const done=new GuiButton('Done',back,200); done.setPosition(window.innerWidth/2-100, window.innerHeight-70);
    this.root.append(title,note,done.element);
  }
}
