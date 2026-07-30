import { guiHeight, guiWidth, GuiButton, Screen } from './MenuWidgets';
import { BUTTON_HEIGHT, BUTTON_WIDTH } from '../BetaGuiMetrics';

export class PauseMenuScreen extends Screen {
  private readonly resume: GuiButton;
  private readonly options: GuiButton;
  private readonly quit: GuiButton;
  public constructor(actions: { readonly resume: () => void; readonly options: () => void; readonly saveQuit: () => void }) {
    super();
    this.root.style.background = 'rgba(0,0,0,0.55)';
    const title=document.createElement('div'); title.textContent='Game menu'; title.style.cssText='position:absolute;left:0;right:0;top:40px;text-align:center;font:18px Minecraft;color:white';
    this.resume=new GuiButton('Back to game',actions.resume,BUTTON_WIDTH,BUTTON_HEIGHT);
    this.options=new GuiButton('Options...',actions.options,BUTTON_WIDTH,BUTTON_HEIGHT);
    this.quit=new GuiButton('Save and quit to title',actions.saveQuit,BUTTON_WIDTH,BUTTON_HEIGHT);
    this.root.append(title,this.resume.element,this.options.element,this.quit.element); this.layout();
  }
  protected override onResize(): void { this.layout(); }
  /**
   * Beta `GuiIngameMenu.initGui()` offsets from `height / 4`:
   *   Back to game        +24
   *   Options...          +96
   *   Save and quit       +120
   * (the +48/+72 rows are Achievements/Stats, which this project omits).
   */
  private layout(): void {
    const x = guiWidth() / 2 - BUTTON_WIDTH / 2;
    const base = guiHeight() / 4;
    this.resume.setPosition(x, base + 24);
    this.options.setPosition(x, base + 96);
    this.quit.setPosition(x, base + 120);
  }
}
