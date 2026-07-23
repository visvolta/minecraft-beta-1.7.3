import { GameMode } from '../../player/GameMode';
import { applyDirtBackground, guiHeight, guiWidth, GuiButton, Screen, TextBox } from './MenuWidgets';

export interface WorldCreateResult { readonly name: string; readonly seedText: string; readonly gameMode: GameMode; }

export class WorldCreateScreen extends Screen {
  private mode = GameMode.Creative;
  private readonly name = new TextBox('New World');
  private readonly seed = new TextBox('');
  private readonly modeButton: GuiButton;
  private readonly createButton: GuiButton;
  private readonly cancel: GuiButton;
  private readonly nameLabel = label('World Name');
  private readonly seedLabel = label('Seed');
  public constructor(create: (result: WorldCreateResult) => void, back: () => void) {
    super(); applyDirtBackground(this.root);
    const title=document.createElement('div'); title.textContent='Create New World'; title.style.cssText='position:absolute;left:0;right:0;top:20px;text-align:center;font:18px Minecraft, monospace;color:white';
    this.seed.element.placeholder='Seed for the World Generator';
    this.modeButton=new GuiButton('Game Mode: Creative',()=>{this.mode=this.mode===GameMode.Creative?GameMode.Survival:GameMode.Creative;this.modeButton.element.textContent=`Game Mode: ${this.mode===GameMode.Creative?'Creative':'Survival'}`;},200,20);
    this.createButton=new GuiButton('Create New World',()=>{const trimmed=this.name.value.trim();if(trimmed.length>0)create({name:trimmed,seedText:this.seed.value,gameMode:this.mode});},200,20);
    this.cancel=new GuiButton('Cancel',back,200,20);
    this.root.append(title,this.nameLabel,this.name.element,this.seedLabel,this.seed.element,this.modeButton.element,this.createButton.element,this.cancel.element);
    this.root.addEventListener('keydown',(e)=>{if(e.key==='Enter')this.createButton.element.click();if(e.key==='Escape')back();});
    this.layout(); setTimeout(()=>this.name.element.focus(),0);
  }
  protected override onResize(): void { this.layout(); }
  private layout(): void {
    const w=guiWidth(), h=guiHeight(), x=w/2-100;
    this.nameLabel.style.left=`${x}px`; this.nameLabel.style.top='60px'; this.name.setPosition(x,78,200);
    this.seedLabel.style.left=`${x}px`; this.seedLabel.style.top='116px'; this.seed.setPosition(x,134,200);
    this.modeButton.setPosition(x,170); this.createButton.setPosition(w/2-205,h-50); this.cancel.setPosition(w/2+5,h-50);
  }
}
function label(text:string):HTMLDivElement{const e=document.createElement('div');e.textContent=text;e.style.cssText='position:absolute;color:#aaa;font:12px Minecraft, monospace';return e;}
