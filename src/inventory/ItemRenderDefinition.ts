import type { ItemIdentity } from './ItemStack'; import type { BlockRegistry } from '../blocks/BlockRegistry';
export type PresentationKind='block'|'sprite'|'custom'; export interface Transform {position:readonly[number,number,number];rotation:readonly[number,number,number];scale:number}
export interface ItemRenderDefinition {kind:PresentationKind; inventoryIcon?:string; firstPerson:Transform; material:'opaque'|'cutout'|'transparent'}
const block:ItemRenderDefinition={kind:'block',firstPerson:{position:[.28,-.04,-.4],rotation:[.45,.8,.1],scale:.62},material:'opaque'}; const sprite:ItemRenderDefinition={kind:'sprite',firstPerson:{position:[.16,-.14,-.38],rotation:[0,0,0],scale:.72},material:'cutout'};
export function presentationFor(identity:ItemIdentity, blocks:BlockRegistry):ItemRenderDefinition{return identity.type==='block'&&blocks.getById(identity.id as number)?.renderType!=='cross'?block:identity.type==='item'?{...sprite,inventoryIcon:String(identity.id)}:sprite;}
