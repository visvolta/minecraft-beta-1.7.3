import * as THREE from 'three';
export interface LegacyUvBox{readonly u:number;readonly v:number;readonly w:number;readonly h:number;readonly d:number;readonly sourceW?:number;readonly sourceH?:number;readonly sourceD?:number;readonly textureWidth?:number;readonly textureHeight?:number;readonly mirror?:boolean;}
type AxisRule=(x:number,y:number,z:number)=>readonly[boolean,boolean];
function projectFace(geometry:THREE.BoxGeometry,face:number,rect:readonly[number,number,number,number],tw:number,th:number,mirror:boolean,rule:AxisRule):void{const position=geometry.getAttribute('position') as THREE.BufferAttribute,uv=geometry.getAttribute('uv') as THREE.BufferAttribute,[x0,y0,x1,y1]=rect;for(let i=0;i<4;i++){const index=face*4+i,[su,sv]=rule(position.getX(index),position.getY(index),position.getZ(index));let u=(su?x1:x0)/tw;if(mirror)u=(x0+x1)/tw-u;const v=(sv?y1:y0)/th;uv.setXY(index,u,v);}uv.needsUpdate=true;}
/**
 * Exact legacy box-net projection for the project's Y-up/+Z-forward models.
 * Source rectangle V=top maps to physical +Y on side faces. Top and bottom
 * use opposite Z orientation, matching ModelRenderer's TexturedQuad vertices.
 * Geometry winding/normals are never modified.
 */
export function applyLegacyBoxUv(g:THREE.BoxGeometry,s:LegacyUvBox):void{const tw=s.textureWidth??64,th=s.textureHeight??32,w=s.sourceW??s.w,h=s.sourceH??s.h,d=s.sourceD??s.d,m=!!s.mirror;
 const left=[s.u,s.v+d,s.u+d,s.v+d+h] as const,front=[s.u+d,s.v+d,s.u+d+w,s.v+d+h] as const,right=[s.u+d+w,s.v+d,s.u+d+w+d,s.v+d+h] as const,back=[s.u+d*2+w,s.v+d,s.u+d*2+w+w,s.v+d+h] as const,top=[s.u+d,s.v,s.u+d+w,s.v+d] as const,bottom=[s.u+d+w,s.v,s.u+d+w+w,s.v+d] as const;
 // Rules return [right/bottom half of source rectangle]. Visual top is y>0.
 projectFace(g,0,m?left:right,tw,th,m,(_x,y,z)=>[z>0,y<0]);          // +X (mirrored boxes swap side rectangles)
 projectFace(g,1,m?right:left,tw,th,m,(_x,y,z)=>[z<0,y<0]);          // -X
 projectFace(g,2,top,tw,th,m,(x,_y,z)=>[x>0,z<0]);                  // +Y
 projectFace(g,3,bottom,tw,th,m,(x,_y,z)=>[x>0,z>0]);               // -Y
 projectFace(g,4,front,tw,th,m,(x,y,_z)=>[x>0,y<0]);                // +Z forward
 projectFace(g,5,back,tw,th,m,(x,y,_z)=>[x<0,y<0]);                 // -Z rear
}
