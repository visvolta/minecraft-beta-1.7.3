import * as THREE from 'three'; import type { PlayerSkinManager } from '../player/PlayerSkinManager';
/** Stage 1 owner of the classic right-arm mesh and arm-only camera pose. */
export class FirstPersonArmRenderer {
 public readonly scene=new THREE.Scene(); public readonly armGroup=new THREE.Group(); public readonly material=new THREE.MeshBasicMaterial({transparent:true,alphaTest:.1,fog:false}); public readonly armMesh=new THREE.Mesh(new THREE.BoxGeometry(.25,.75,.25),this.material); public readonly sleeveMesh=new THREE.Mesh(new THREE.BoxGeometry(.252,.752,.252),this.material);
 constructor(){this.armMesh.position.set(0,-.375,0);this.sleeveMesh.position.set(0,-.375,0);this.sleeveMesh.visible=false;this.armGroup.add(this.armMesh,this.sleeveMesh);this.scene.add(this.armGroup)}
 updateSkin(s:PlayerSkinManager){const texture=s.getActiveTexture();if(texture){this.material.map=texture;this.material.needsUpdate=true;}s.applyFirstPersonArmUVs(this.armMesh.geometry,s.getPartUVs(40,16,4,12,4,false));}
 setVisible(v:boolean){this.armGroup.visible=v} setArmMeshVisible(v:boolean){this.armMesh.visible=v;this.sleeveMesh.visible=false}
 /** Camera-space base pose; FirstPersonMotionController layers bob/swing above this. */ setPose(camera:THREE.PerspectiveCamera){this.armGroup.position.copy(camera.position);this.armGroup.quaternion.copy(camera.quaternion);this.armGroup.translateX(.65);this.armGroup.translateY(-.4);this.armGroup.translateZ(-.8);this.armGroup.rotateX(-Math.PI/3.5)}
 dispose(){this.armMesh.geometry.dispose();this.sleeveMesh.geometry.dispose();this.material.dispose()}
}
