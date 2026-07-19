import * as THREE from 'three';
/** Single authoritative double-sided thin sprite geometry builder. */
export class SpriteModelBuilder { static build(u0:number,v0:number,u1:number,v1:number):THREE.BufferGeometry{const h=.5,z=.001,g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([-h,h,z,h,h,z,-h,-h,z,h,-h,z,-h,h,-z,h,h,-z,-h,-h,-z,h,-h,-z],3));g.setAttribute('uv',new THREE.Float32BufferAttribute([u0,v0,u1,v0,u0,v1,u1,v1,u1,v0,u0,v0,u1,v1,u0,v1],2));g.setIndex([0,2,1,1,2,3,5,6,4,7,6,5]);g.computeVertexNormals();return g;} }
