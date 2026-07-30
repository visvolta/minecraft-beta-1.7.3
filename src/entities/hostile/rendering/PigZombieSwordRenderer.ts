import * as THREE from 'three';
import type { EntityTextureAssets } from '../../../assets/EntityTextureAssets';
import { attachEntityLighting } from '../../../rendering/ChunkRenderer';

/** Shared sword plane geometry (one per texture-assets instance, like the bow). */
const geometry = new THREE.PlaneGeometry(0.65, 0.65);
const owned = new WeakSet<EntityTextureAssets>();

/**
 * Render-only golden-sword attachment for the zombie pigman's right hand,
 * sibling of {@link SkeletonBowRenderer}. Static (no draw/aim animation),
 * entity-lit so it picks up Nether lava/glowstone/fire light.
 */
export class PigZombieSwordRenderer {
  private readonly material: THREE.MeshBasicMaterial;
  private readonly mesh: THREE.Mesh;

  public constructor(parent: THREE.Group, assets: EntityTextureAssets) {
    if (!owned.has(assets)) { assets.own(geometry); owned.add(assets); }
    this.material = new THREE.MeshBasicMaterial({ map: assets.get('goldSword'), transparent: true, alphaTest: 0.1, side: THREE.DoubleSide });
    attachEntityLighting(this.material);
    this.mesh = new THREE.Mesh(geometry, this.material);
    // Hand-held pose matching the bow attachment so it rides the right arm.
    this.mesh.position.set(0, -0.68, 0.08);
    this.mesh.rotation.set(0, Math.PI / 2, 0);
    parent.add(this.mesh);
  }

  public dispose(): void {
    this.mesh.removeFromParent();
    this.material.dispose();
  }
}
