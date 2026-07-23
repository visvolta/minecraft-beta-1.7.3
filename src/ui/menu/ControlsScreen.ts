import { DEFAULT_KEY_BINDINGS, updateBinding, type GameSettings } from '../../settings/GameSettings';
import type { InputAction } from '../../input/Input';
import { applyDirtBackground, guiHeight, guiWidth, GuiButton, Screen } from './MenuWidgets';

const ACTIONS: readonly InputAction[] = ['forward','back','left','right','jump','sprint','inventory','drop','pause','perspective'];
const LABELS: Readonly<Record<InputAction,string>> = { forward:'Forward', back:'Back', left:'Left', right:'Right', jump:'Jump', sprint:'Sneak/Descend', inventory:'Inventory', drop:'Drop', pause:'Pause', perspective:'Perspective' };

export class ControlsScreen extends Screen {
  private capture: InputAction | null = null;
  private doneCallback: (() => void) | undefined;
  public constructor(private settings: GameSettings, private readonly setSettings: (settings: GameSettings) => void, done: () => void) {
    super(); applyDirtBackground(this.root); this.doneCallback = done; this.render();
  }
  protected override onResize(): void { if (this.doneCallback) this.render(); }
  private render(): void {
    const done = this.doneCallback!;
    this.root.replaceChildren();
    const title=document.createElement('div'); title.textContent=this.capture===null?'Controls':'Press a key...'; title.style.cssText='position:absolute;left:0;right:0;top:16px;text-align:center;font:18px Minecraft, monospace;color:white'; this.root.append(title);
    const w=guiWidth(), h=guiHeight(), x1=w/2-155, x2=w/2+5;
    for(let i=0;i<ACTIONS.length;i++){const action=ACTIONS[i]!;const x=i%2===0?x1:x2,y=48+Math.floor(i/2)*24;const key=this.settings.controls.bindings[action][0]??'Unbound';const conflict=this.hasConflict(action,key);const b=new GuiButton(`${LABELS[action]}: ${key}${conflict?' *':''}`,()=>{this.capture=action;this.render();},150,20);b.setPosition(x,y);this.root.append(b.element);} 
    const reset=new GuiButton('Reset Keys',()=>{this.settings={...this.settings,controls:{bindings:DEFAULT_KEY_BINDINGS}};this.setSettings(this.settings);this.render();},150,20); reset.setPosition(w/2-155,h-40);
    const back=new GuiButton('Done',done,150,20); back.setPosition(w/2+5,h-40); this.root.append(reset.element,back.element);
    this.root.onkeydown=(e)=>{if(this.capture===null)return;if(e.code==='Escape'){this.capture=null;this.render();return;}this.settings=updateBinding(this.settings,this.capture,e.code);this.setSettings(this.settings);this.capture=null;this.render();};
    setTimeout(()=>{this.root.tabIndex=0;this.root.focus();},0);
  }
  private hasConflict(action:InputAction,code:string):boolean{return ACTIONS.some(other=>other!==action&&this.settings.controls.bindings[other].includes(code));}
}
