import * as THREE from 'three';
import type { BlockDefinition } from '../blocks/BlockDefinition';
import type { TextureAtlas } from '../assets/TextureAtlas';
import { resolveBlockTexture } from '../blocks/resolveBlockTexture';
import { resolveBlockTint } from '../blocks/resolveBlockTint';
/** Fresh isolated standard cube: BoxGeometry owns exact shared vertices, winding and normals. */ export class IsolatedBlockModelBuilder{static build(def:BlockDefinition,atlas:TextureAtlas){const g=new THREE.BoxGeometry(1,1,1),uv=g.getAttribute('uv') as THREE.BufferAttribute,col=new Float32Array(72),slots=['side','side','top','bottom','side','side'] as const;slots.forEach((slot,f)=>{const r=atlas.getUvRect(resolveBlockTexture(def,slot)??''),t=resolveBlockTint(def,slot),b=f*4;for(const [n,x,y]of [[0,r?.u0??0,r?.v1??1],[1,r?.u1??1,r?.v1??1],[2,r?.u0??0,r?.v0??0],[3,r?.u1??1,r?.v0??0]]as const){uv.setXY(b+n,x,y);const i=(b+n)*3;col[i]=r?t[0]:1;col[i+1]=r?t[1]:0;col[i+2]=r?t[2]:1;}});g.setAttribute('color',new THREE.BufferAttribute(col,3));return g;}}
