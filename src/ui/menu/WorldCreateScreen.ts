import { GameMode } from '../../player/GameMode';
import { applyDirtBackground, GuiButton, Screen, TextBox } from './MenuWidgets';

export interface WorldCreateResult { readonly name: string; readonly seedText: string; readonly gameMode: GameMode; }

export class WorldCreateScreen extends Screen {
  private mode = GameMode.Creative;
  public constructor(create: (result: WorldCreateResult) => void, back: () => void) {
    super(); applyDirtBackground(this.root);
    const title=document.createElement('div'); title.textContent='Create New World'; title.style.cssText='position:absolute;left:0;right:0;top:20px;text-align:center;font:22px monospace;color:white';
    const name=new TextBox('New World'); name.setPosition(window.innerWidth/2-150,90,300);
    const seed=new TextBox(''); seed.element.placeholder='Seed for the World Generator'; seed.setPosition(window.innerWidth/2-150,150,300);
    const modeButton=new GuiButton('Game Mode: Creative',()=>{this.mode=this.mode===GameMode.Creative?GameMode.Survival:GameMode.Creative;modeButton.element.textContent=`Game Mode: ${this.mode===GameMode.Creative?'Creative':'Survival'}`;},200); modeButton.setPosition(window.innerWidth/2-100,190);
    const createButton=new GuiButton('Create New World',()=>{const trimmed=name.value.trim();if(trimmed.length>0)create({name:trimmed,seedText:seed.value,gameMode:this.mode});},200); createButton.setPosition(window.innerWidth/2-210,window.innerHeight-70);
    const cancel=new GuiButton('Cancel',back,200); cancel.setPosition(window.innerWidth/2+10,window.innerHeight-70);
    const nameLabel=label('World Name',window.innerWidth/2-150,68); const seedLabel=label('Seed',window.innerWidth/2-150,128);
    this.root.append(title,nameLabel,name.element,seedLabel,seed.element,modeButton.element,createButton.element,cancel.element);
    this.root.addEventListener('keydown',(e)=>{if(e.key==='Enter')createButton.element.click();if(e.key==='Escape')back();});
    setTimeout(()=>name.element.focus(),0);
  }
}
function label(text:string,x:number,y:number):HTMLDivElement{const e=document.createElement('div');e.textContent=text;e.style.cssText=`position:absolute;left:${x}px;top:${y}px;color:#aaa;font:14px monospace`;return e;}
