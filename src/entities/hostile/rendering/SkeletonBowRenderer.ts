import * as THREE from 'three';
import type { EntityTextureAssets,EntityTextureKey } from '../../../assets/EntityTextureAssets';import { attachEntityLighting } from '../../../rendering/ChunkRenderer';
const geometry=new THREE.PlaneGeometry(0.65,0.65);const owned=new WeakSet<EntityTextureAssets>();
const KEYS:readonly EntityTextureKey[]=['bowStandby','bowPulling0','bowPulling1','bowPulling2'];
/** Render-only hand attachment; frame changes mutate one material only. */
export class SkeletonBowRenderer{
 private readonly material:THREE.MeshBasicMaterial;private readonly mesh:THREE.Mesh;private frame=-1;
 public constructor(parent:THREE.Group,private readonly assets:EntityTextureAssets){if(!owned.has(assets)){assets.own(geometry);owned.add(assets);}this.material=new THREE.MeshBasicMaterial({map:assets.get('bowStandby'),transparent:true,alphaTest:.1,side:THREE.DoubleSide});attachEntityLighting(this.material);this.mesh=new THREE.Mesh(geometry,this.material);this.mesh.position.set(0,-.68,.08);this.mesh.rotation.set(0,Math.PI/2,0);parent.add(this.mesh);this.setDrawProgress(0,false);}
 public setDrawProgress(progress:number,drawing:boolean):void{const frame=!drawing?0:progress<1/3?1:progress<2/3?2:3;if(frame===this.frame)return;this.frame=frame;this.material.map=this.assets.get(KEYS[frame]!);this.material.needsUpdate=true;}
 public get frameIndex():number{return this.frame;}
 public dispose():void{this.mesh.removeFromParent();this.material.dispose();}
}
