import * as THREE from 'three';
import type { EntityTextureAssets } from '../../../assets/EntityTextureAssets';
import { attachEntityLighting } from '../../../rendering/ChunkRenderer';
import { SpriteModelBuilder } from '../../../inventory/SpriteModelBuilder';
import { THIRD_PERSON_TOOL_POSITION, THIRD_PERSON_TOOL_ROTATION, THIRD_PERSON_TOOL_SCALE } from '../../../player/PlayerConstants';

/**
 * Held golden sword for the zombie pigman. This deliberately reuses the
 * player's third-person held-item conventions — `SpriteModelBuilder` sprite
 * geometry plus the shared `THIRD_PERSON_TOOL_*` transform (the Beta full-3D
 * sword/tool pose) — instead of a bespoke rotation, so the blade points
 * outward/up from the hand exactly like a player-held sword.
 *
 * The gold-sword texture is registered as an *entity* texture (loaded
 * `flipY=false`, like mob skins). Player item sprites render `flipY=true`, so
 * the texture is cloned and re-flagged `flipY=true` to match the verified
 * held-item orientation rather than appearing upside down. Parented to the
 * biped right-arm attachment, so it follows idle/walk/attack/death poses.
 */
export class PigZombieSwordRenderer {
  private readonly material: THREE.MeshBasicMaterial;
  private readonly mesh: THREE.Mesh;
  private readonly texture: THREE.Texture;

  public constructor(parent: THREE.Group, assets: EntityTextureAssets) {
    const texture = assets.get('goldSword').clone();
    texture.flipY = true;
    texture.needsUpdate = true;
    this.texture = texture;
    this.material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide });
    attachEntityLighting(this.material);
    this.mesh = new THREE.Mesh(SpriteModelBuilder.build(0, 0, 1, 1, false), this.material);
    this.mesh.position.set(...THIRD_PERSON_TOOL_POSITION);
    this.mesh.rotation.set(...THIRD_PERSON_TOOL_ROTATION);
    this.mesh.scale.setScalar(THIRD_PERSON_TOOL_SCALE);
    parent.add(this.mesh);
  }

  public dispose(): void {
    this.mesh.removeFromParent();
    this.material.dispose();
    this.texture.dispose();
  }
}
