import { GameMode } from '../../player/GameMode';
import type { WorldIndexEntry } from '../../persistence/world/WorldIndex';
import { applyDirtBackground, GuiButton, Screen } from './MenuWidgets';

export interface WorldSelectActions { readonly play: (worldId: string) => void; readonly create: () => void; readonly rename: (worldId: string) => void; readonly delete: (worldId: string) => void; readonly back: () => void; }

export class WorldSelectScreen extends Screen {
  private selected: string | undefined;
  public constructor(worlds: readonly WorldIndexEntry[], actions: WorldSelectActions) {
    super(); applyDirtBackground(this.root);
    const title=document.createElement('div'); title.textContent='Select World'; title.style.cssText='position:absolute;left:0;right:0;top:18px;text-align:center;font:22px monospace;color:white';
    const list=document.createElement('div'); list.style.cssText='position:absolute;left:50%;top:60px;width:620px;height:320px;transform:translateX(-50%);overflow:auto';
    const play=new GuiButton('Play Selected World',()=>{if(this.selected)actions.play(this.selected);},220); const create=new GuiButton('Create New World',actions.create,220); const rename=new GuiButton('Rename',()=>{if(this.selected)actions.rename(this.selected);},120); const del=new GuiButton('Delete',()=>{if(this.selected)actions.delete(this.selected);},120); const back=new GuiButton('Cancel',actions.back,120);
    const updateButtons=()=>{const disabled=this.selected===undefined;play.setDisabled(disabled);rename.setDisabled(disabled);del.setDisabled(disabled);};
    if(worlds.length===0){const empty=document.createElement('div');empty.textContent='No worlds found';empty.style.cssText='text-align:center;color:#aaa;margin-top:80px;font:18px monospace';list.append(empty);} else for(const world of worlds){const row=document.createElement('div');row.style.cssText='height:66px;margin:4px 0;padding:6px 8px;background:#000;color:white;border:2px solid transparent;font:16px monospace;cursor:pointer';row.innerHTML=`<div>${escapeHtml(world.displayName)}</div><div style="color:#aaa">${escapeHtml(world.worldId)} (${new Date(world.lastPlayedAt||world.createdAt).toLocaleString()})</div><div style="color:#aaa">${world.gameMode===GameMode.Creative?'Creative':'Survival'} Mode, Version ${world.saveVersion}</div>`;row.addEventListener('click',()=>{this.selected=world.worldId;for(const child of list.children)(child as HTMLElement).style.borderColor='transparent';row.style.borderColor='white';updateButtons();});row.addEventListener('dblclick',()=>actions.play(world.worldId));list.append(row);} 
    const y=window.innerHeight-90; play.setPosition(window.innerWidth/2-230,y); create.setPosition(window.innerWidth/2+10,y); rename.setPosition(window.innerWidth/2-230,y+36); del.setPosition(window.innerWidth/2-90,y+36); back.setPosition(window.innerWidth/2+90,y+36); updateButtons();
    this.root.append(title,list,play.element,create.element,rename.element,del.element,back.element);
  }
}
function escapeHtml(value:string):string{return value.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]!));}
