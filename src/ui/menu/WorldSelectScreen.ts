import { GameMode } from '../../player/GameMode';
import type { WorldSummary } from '../../persistence2/backend/StorageBackend';
import { applyDirtBackground, guiHeight, guiWidth, GuiButton, Screen } from './MenuWidgets';

export interface WorldSelectActions { readonly play: (worldId: string) => void; readonly create: () => void; readonly rename: (worldId: string) => void; readonly delete: (worldId: string) => void; readonly back: () => void; }

export class WorldSelectScreen extends Screen {
  private selected: string | undefined;
  private readonly list=document.createElement('div');
  private readonly play: GuiButton;
  private readonly create: GuiButton;
  private readonly rename: GuiButton;
  private readonly del: GuiButton;
  private readonly back: GuiButton;
  public constructor(worlds: readonly WorldSummary[], actions: WorldSelectActions) {
    super(); applyDirtBackground(this.root);
    const title=document.createElement('div'); title.textContent='Select World'; title.style.cssText='position:absolute;left:0;right:0;top:18px;text-align:center;font:18px Minecraft, monospace;color:white';
    this.list.style.cssText='position:absolute;overflow:auto;color:white';
    this.play=new GuiButton('Play Selected World',()=>{if(this.selected)actions.play(this.selected);},150,20); this.create=new GuiButton('Create New World',actions.create,150,20); this.rename=new GuiButton('Rename',()=>{if(this.selected)actions.rename(this.selected);},70,20); this.del=new GuiButton('Delete',()=>{if(this.selected)actions.delete(this.selected);},70,20); this.back=new GuiButton('Cancel',actions.back,150,20);
    const updateButtons=()=>{const disabled=this.selected===undefined;this.play.setDisabled(disabled);this.rename.setDisabled(disabled);this.del.setDisabled(disabled);};
    if(worlds.length===0){const empty=document.createElement('div');empty.textContent='No worlds found';empty.style.cssText='text-align:center;color:#aaa;margin-top:60px;font:14px Minecraft, monospace';this.list.append(empty);} else for(const world of worlds){const row=document.createElement('div');
      // Beta-sized rows: 8px text on three tight lines. Long names and seeds
      // are ellipsised rather than allowed to wrap and break the layout.
      row.style.cssText='height:34px;margin:2px 0;padding:2px 4px;box-sizing:border-box;background:#000;color:white;border:1px solid transparent;font:8px Minecraft, monospace;line-height:10px;cursor:pointer;overflow:hidden';
      const clip='overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      // Seed comes from the already-loaded world summary, so showing it costs
      // no chunk loads.
      const seedText=world.seed===undefined||world.seed===''?'\u2014':String(world.seed);
      const mode=world.gameMode===GameMode.Creative?'Creative':'Survival';
      const played=new Date(world.lastPlayedMs||world.createdAtMs).toLocaleDateString();
      row.innerHTML=`<div style="${clip}">${escapeHtml(world.displayName)}</div><div style="color:#aaa;${clip}">Seed: ${escapeHtml(seedText)}</div><div style="color:#aaa;${clip}">${mode} Mode \u00b7 ${played}</div>`;
      row.addEventListener('click',()=>{this.selected=world.worldId;for(const child of this.list.children)(child as HTMLElement).style.borderColor='transparent';row.style.borderColor='white';updateButtons();});row.addEventListener('dblclick',()=>actions.play(world.worldId));this.list.append(row);} 
    updateButtons(); this.root.append(title,this.list,this.play.element,this.create.element,this.rename.element,this.del.element,this.back.element); this.layout();
  }
  protected override onResize(): void { this.layout(); }
  private layout(): void { const w=guiWidth(),h=guiHeight(),listW=Math.min(320,w-40);this.list.style.left=`${Math.floor((w-listW)/2)}px`;this.list.style.top='50px';this.list.style.width=`${listW}px`;this.list.style.height=`${Math.max(80,h-130)}px`;const y=h-52;this.play.setPosition(w/2-154,y);this.create.setPosition(w/2+4,y);this.rename.setPosition(w/2-154,y+24);this.del.setPosition(w/2-74,y+24);this.back.setPosition(w/2+4,y+24); }
}
function escapeHtml(value:string):string{return value.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]!));}
