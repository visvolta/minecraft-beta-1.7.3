import { computeGuiScale, type GuiScaleSetting } from '../ui/GuiScale';

export interface SlotRect { index:number;x:number;y:number;size:number }
/** Strict Beta 182×22 logical bar: nine contiguous 20px cells. */
export class HotbarLayout {
  public scale=1;
  private guiScaleSetting: GuiScaleSetting = 0;
  public constructor(guiScaleSetting: GuiScaleSetting = 0) { this.guiScaleSetting = guiScaleSetting; }
  public setGuiScale(setting: GuiScaleSetting): void { this.guiScaleSetting = setting; this.resize(); }
  resize(){this.scale=computeGuiScale(this.guiScaleSetting);}
  slots():SlotRect[]{const width=182*this.scale,left=Math.floor((innerWidth-width)/2),y=innerHeight-22*this.scale;return Array.from({length:9},(_,index)=>({index,x:left+index*20*this.scale,y,size:20*this.scale}));}
}
