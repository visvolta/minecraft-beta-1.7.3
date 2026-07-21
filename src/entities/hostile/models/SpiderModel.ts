import { Group,type Texture } from 'three';import { EntityModel } from '../../living/EntityModel';
const Q=Math.PI/4,LEG_PIVOT_Y=11.32;
/** Y-up/local +Z-forward conversion of Beta ModelSpider's eight leg pivots. */
export class SpiderModel extends EntityModel{
 private readonly head=new Group();private readonly legs:Group[]=[];
 private readonly baseX=[0,0,0,0,0,0,0,0];
 private readonly baseY=[-2*Q,2*Q,-Q,Q,Q,-Q,2*Q,-2*Q];
 private readonly baseZ=[Q,-Q,Q*.74,-Q*.74,Q*.74,-Q*.74,Q,-Q];
 public constructor(texture?:Texture,eyesTexture?:Texture){super();const material=this.createMaterial(texture?0xffffff:0x332b2b,texture);
  // Beta model Y=15 rendered through RenderLiving becomes Y=9 in feet-up space.
  this.addBox(this.head,{w:8,h:8,d:8},material,0,9,3,{u:32,v:4});
  this.addBox(this.root,{w:6,h:6,d:6},material,0,9,0,{u:0,v:0});
  this.addBox(this.root,{w:10,h:8,d:12},material,0,9,-9,{u:0,v:12});
  if(eyesTexture){const eyeMaterial=this.createMaterial(0xffffff,eyesTexture,true);this.addBox(this.head,{w:8.04,h:8.04,d:8.04},eyeMaterial,0,9,3,{u:32,v:4,sourceW:8,sourceH:8,sourceD:8});}
  this.root.add(this.head);
  for(let i=0;i<8;i++){const pair=Math.floor(i/2),left=i%2===0,leg=new Group();leg.position.set((left?-4:4)/16,LEG_PIVOT_Y/16,(-2+pair)/16);this.addBox(leg,{w:16,h:2,d:2},material,left?-7:7,0,0,{u:18,v:0,mirror:!left});leg.rotation.set(this.baseX[i]!,this.baseY[i]!,this.baseZ[i]!);this.legs.push(leg);this.root.add(leg);}
 }
 public updatePose(phase:number,amount:number,yaw:number,pitch:number):void{this.head.rotation.y=-yaw*Math.PI/180;this.head.rotation.x=pitch*Math.PI/180;
  const yOffsets=[Math.cos(phase*1.3324),Math.cos(phase*1.3324+Math.PI),Math.cos(phase*1.3324+Math.PI/2),Math.cos(phase*1.3324+Math.PI*1.5)];
  const zOffsets=[Math.abs(Math.sin(phase*.6662)),Math.abs(Math.sin(phase*.6662+Math.PI)),Math.abs(Math.sin(phase*.6662+Math.PI/2)),Math.abs(Math.sin(phase*.6662+Math.PI*1.5))];
  for(let i=0;i<8;i++){const pair=Math.floor(i/2),left=i%2===0,side=left?1:-1;this.legs[i]!.rotation.x=this.baseX[i]!;this.legs[i]!.rotation.y=this.baseY[i]!+side*yOffsets[pair]!*0.4*amount;this.legs[i]!.rotation.z=this.baseZ[i]!-side*zOffsets[pair]!*0.4*amount;}
 }
 /** Validation-only immutable snapshots of authored pivots/base pose. */
 public getLegPoseAudit():readonly{readonly x:number;readonly y:number;readonly z:number;readonly rx:number;readonly ry:number;readonly rz:number;readonly currentX:number;readonly currentY:number;readonly currentZ:number}[]{return this.legs.map((leg,i)=>({x:leg.position.x,y:leg.position.y,z:leg.position.z,rx:this.baseX[i]!,ry:this.baseY[i]!,rz:this.baseZ[i]!,currentX:leg.rotation.x,currentY:leg.rotation.y,currentZ:leg.rotation.z}));}
}
