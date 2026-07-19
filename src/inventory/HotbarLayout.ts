export interface SlotRect { index:number;x:number;y:number;size:number }
/** Strict Beta 182×22 logical bar: nine contiguous 20px cells. */
export class HotbarLayout { public scale=1; resize(){this.scale=Math.max(1,Math.min(4,Math.floor(innerWidth/182),Math.floor(innerHeight/22)));} slots():SlotRect[]{const width=182*this.scale,left=Math.floor((innerWidth-width)/2),y=innerHeight-22*this.scale;return Array.from({length:9},(_,index)=>({index,x:left+index*20*this.scale,y,size:20*this.scale}));} }
