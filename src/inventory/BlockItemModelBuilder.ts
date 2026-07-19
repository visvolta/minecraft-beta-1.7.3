import * as THREE from 'three';
import type { BlockDefinition } from '../blocks/BlockDefinition';
import type { TextureAtlas } from '../assets/TextureAtlas';
import { resolveBlockTexture } from '../blocks/resolveBlockTexture';
import { resolveBlockTint } from '../blocks/resolveBlockTint';

/** Authoritative isolated standard-cube builder. BoxGeometry supplies six correctly wound outward faces. */
export class BlockItemModelBuilder {
  public static build3DGeometry(def: BlockDefinition, atlas: TextureAtlas): THREE.BufferGeometry {
    const geometry = new THREE.BoxGeometry(1, 1, 1); // +X,-X,+Y,-Y,+Z,-Z; 4 vertices each
    const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
    const colors = new Float32Array(24 * 3);
    const faces: Array<'side'|'top'|'bottom'> = ['side','side','top','bottom','side','side'];
    for (let face=0; face<6; face++) {
      const slot=faces[face]!; const name=resolveBlockTexture(def,slot); const rect=name?atlas.getUvRect(name):undefined; const tint=resolveBlockTint(def,slot);
      const u0=rect?.u0??0, v0=rect?.v0??0, u1=rect?.u1??1, v1=rect?.v1??1; const base=face*4;
      // BoxGeometry's face vertices are already oriented; only assign texture rectangle.
      uv.setXY(base,u0,v1); uv.setXY(base+1,u1,v1); uv.setXY(base+2,u0,v0); uv.setXY(base+3,u1,v0);
      for(let vertex=0;vertex<4;vertex++){const i=(base+vertex)*3; colors[i]=rect?tint[0]:1; colors[i+1]=rect?tint[1]:0; colors[i+2]=rect?tint[2]:1;}
    }
    uv.needsUpdate=true; geometry.setAttribute('color',new THREE.BufferAttribute(colors,3)); geometry.computeVertexNormals(); return geometry;
  }
  /** Separate sprite/cross/other special-shape renderers can use this canonical flat source. */
  public static buildFlatGeometry(def: BlockDefinition, atlas: TextureAtlas): THREE.BufferGeometry {
    const name=resolveBlockTexture(def,'side'); const rect=name?atlas.getUvRect(name):undefined; const tint=resolveBlockTint(def,'side');
    const g=new THREE.PlaneGeometry(1,1); const uv=g.getAttribute('uv') as THREE.BufferAttribute; uv.setXY(0,rect?.u0??0,rect?.v1??1);uv.setXY(1,rect?.u1??1,rect?.v1??1);uv.setXY(2,rect?.u0??0,rect?.v0??0);uv.setXY(3,rect?.u1??1,rect?.v0??0); g.setAttribute('color',new THREE.Float32BufferAttribute([tint[0],tint[1],tint[2],tint[0],tint[1],tint[2],tint[0],tint[1],tint[2],tint[0],tint[1],tint[2]],3)); return g;
  }
  public static buildDebugPlaceholder(): THREE.BufferGeometry { const g=new THREE.PlaneGeometry(1,1);g.setAttribute('color',new THREE.Float32BufferAttribute([1,0,1,1,0,1,1,0,1,1,0,1],3));return g; }
}
