import { DEFAULT_KEY_BINDINGS, updateBinding, type GameSettings } from '../../settings/GameSettings';
import type { InputAction } from '../../input/Input';
import { applyDirtBackground, GuiButton, Screen } from './MenuWidgets';

const ACTIONS: readonly InputAction[] = ['forward','back','left','right','jump','sprint','inventory','drop','pause','perspective'];
const LABELS: Readonly<Record<InputAction,string>> = { forward:'Forward', back:'Back', left:'Left', right:'Right', jump:'Jump', sprint:'Sneak/Descend', inventory:'Inventory', drop:'Drop', pause:'Pause', perspective:'Perspective' };

export class ControlsScreen extends Screen {
  private capture: InputAction | null = null;
  public constructor(private settings: GameSettings, private readonly setSettings: (settings: GameSettings) => void, done: () => void) {
    super(); applyDirtBackground(this.root); this.render(done);
  }
  private render(done: () => void): void {
    this.root.replaceChildren();
    const title=document.createElement('div'); title.textContent=this.capture===null?'Controls':'Press a key...'; title.style.cssText='position:absolute;left:0;right:0;top:24px;text-align:center;font:24px Minecraft, monospace;color:white'; this.root.append(title);
    for(let i=0;i<ACTIONS.length;i++){const action=ACTIONS[i]!;const x=window.innerWidth/2-310+(i%2)*320,y=70+Math.floor(i/2)*44;const key=this.settings.controls.bindings[action][0]??'Unbound';const conflict=this.hasConflict(action,key);const b=new GuiButton(`${LABELS[action]}: ${key}${conflict?' *':''}`,()=>{this.capture=action;this.render(done);});b.setPosition(x,y);this.root.append(b.element);} 
    const reset=new GuiButton('Reset Keys',()=>{this.settings={...this.settings,controls:{bindings:DEFAULT_KEY_BINDINGS}};this.setSettings(this.settings);this.render(done);}); reset.setPosition(window.innerWidth/2-310,window.innerHeight-72);
    const back=new GuiButton('Done',done); back.setPosition(window.innerWidth/2+10,window.innerHeight-72); this.root.append(reset.element,back.element);
    this.root.onkeydown=(e)=>{if(this.capture===null)return;if(e.code==='Escape'){this.capture=null;this.render(done);return;}this.settings=updateBinding(this.settings,this.capture,e.code);this.setSettings(this.settings);this.capture=null;this.render(done);};
    setTimeout(()=>{this.root.tabIndex=0;this.root.focus();},0);
  }
  private hasConflict(action:InputAction,code:string):boolean{return ACTIONS.some(other=>other!==action&&this.settings.controls.bindings[other].includes(code));}
}
