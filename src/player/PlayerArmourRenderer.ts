import * as THREE from 'three';
import { armourTextureLayerForSlot } from '../assets/ArmourTextureAssets';
import { ARMOUR_SLOTS, type ArmourSlot } from '../items/ArmourMaterial';
import type { PlayerEquipment } from '../inventory/PlayerEquipment';
import type { ArmourGeometryCache } from '../rendering/armour/ArmourGeometryCache';
import type { ArmourMaterialCache } from '../rendering/armour/ArmourMaterialCache';
import { PLAYER_MODEL_SCALE, PLAYER_MODEL_SHOULDER_OFFSET_Y } from './PlayerConstants';

export interface PlayerArmourParents {
  readonly head: THREE.Group;
  readonly body: THREE.Group;
  readonly rightArm: THREE.Group;
  readonly leftArm: THREE.Group;
  readonly rightLeg: THREE.Group;
  readonly leftLeg: THREE.Group;
}

/**
 * Player-owned mesh instances backed entirely by engine-owned shared geometry,
 * texture and material caches. Body groups remain the sole animation owners.
 */
export class PlayerArmourRenderer {
  private readonly slotMeshes: Readonly<Record<ArmourSlot, readonly THREE.Mesh[]>>;
  private lastEquipmentRevision = -1;
  private disposed = false;

  public constructor(
    parents: PlayerArmourParents,
    private readonly equipment: PlayerEquipment,
    geometry: ArmourGeometryCache,
    private readonly materials: ArmourMaterialCache,
  ) {
    const hiddenMaterial = materials.get('leather', 1);
    const helmetHead = this.createMesh(geometry.helmet.head, hiddenMaterial, 'helmet', 'head');
    const helmetHeadwear = this.createMesh(geometry.helmet.headwear, hiddenMaterial, 'helmet', 'headwear');
    helmetHead.position.y = helmetHeadwear.position.y = 4 * PLAYER_MODEL_SCALE;
    parents.head.add(helmetHead, helmetHeadwear);

    const chestBody = this.createMesh(geometry.chest.body, hiddenMaterial, 'chestplate', 'body');
    chestBody.position.y = -6 * PLAYER_MODEL_SCALE;
    parents.body.add(chestBody);
    const chestRightArm = this.createMesh(geometry.chest.rightArm, hiddenMaterial, 'chestplate', 'right-arm');
    const chestLeftArm = this.createMesh(geometry.chest.leftArm, hiddenMaterial, 'chestplate', 'left-arm');
    chestRightArm.position.y = chestLeftArm.position.y = PLAYER_MODEL_SHOULDER_OFFSET_Y;
    parents.rightArm.add(chestRightArm);
    parents.leftArm.add(chestLeftArm);

    const leggingsBody = this.createMesh(geometry.leggings.body, hiddenMaterial, 'leggings', 'body');
    leggingsBody.position.y = -6 * PLAYER_MODEL_SCALE;
    parents.body.add(leggingsBody);
    const leggingsRightLeg = this.createMesh(geometry.leggings.rightLeg, hiddenMaterial, 'leggings', 'right-leg');
    const leggingsLeftLeg = this.createMesh(geometry.leggings.leftLeg, hiddenMaterial, 'leggings', 'left-leg');
    leggingsRightLeg.position.y = leggingsLeftLeg.position.y = -6 * PLAYER_MODEL_SCALE;
    parents.rightLeg.add(leggingsRightLeg);
    parents.leftLeg.add(leggingsLeftLeg);

    const bootsRightLeg = this.createMesh(geometry.boots.rightLeg, hiddenMaterial, 'boots', 'right-leg');
    const bootsLeftLeg = this.createMesh(geometry.boots.leftLeg, hiddenMaterial, 'boots', 'left-leg');
    bootsRightLeg.position.y = bootsLeftLeg.position.y = -6 * PLAYER_MODEL_SCALE;
    parents.rightLeg.add(bootsRightLeg);
    parents.leftLeg.add(bootsLeftLeg);

    this.slotMeshes = {
      helmet: [helmetHead, helmetHeadwear],
      chestplate: [chestBody, chestRightArm, chestLeftArm],
      leggings: [leggingsBody, leggingsRightLeg, leggingsLeftLeg],
      boots: [bootsRightLeg, bootsLeftLeg],
    };
    this.sync(true);
  }

  public sync(force = false): boolean {
    if (this.disposed) return false;
    const revision = this.equipment.revision;
    if (!force && revision === this.lastEquipmentRevision) return false;
    this.lastEquipmentRevision = revision;

    for (const slot of ARMOUR_SLOTS) {
      const stack = this.equipment.getStack(slot);
      const definition = stack?.getDefinition();
      const materialId = definition?.armourSlot === slot ? definition.armourMaterial : undefined;
      const meshes = this.slotMeshes[slot];
      if (materialId === undefined) {
        for (const mesh of meshes) mesh.visible = false;
        continue;
      }
      const renderMaterial = this.materials.get(materialId, armourTextureLayerForSlot(slot));
      for (const mesh of meshes) {
        if (mesh.material !== renderMaterial) mesh.material = renderMaterial;
        mesh.visible = true;
      }
    }
    return true;
  }

  public getMeshes(slot: ArmourSlot): readonly THREE.Mesh[] {
    return this.slotMeshes[slot];
  }

  public get meshCount(): number {
    let count = 0;
    for (const slot of ARMOUR_SLOTS) count += this.slotMeshes[slot].length;
    return count;
  }

  public get renderedRevision(): number {
    return this.lastEquipmentRevision;
  }

  /** Detaches Player-owned Mesh instances; shared resources remain engine-owned. */
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const slot of ARMOUR_SLOTS) {
      for (const mesh of this.slotMeshes[slot]) {
        mesh.visible = false;
        mesh.removeFromParent();
      }
    }
  }

  private createMesh(
    geometry: THREE.BoxGeometry,
    material: THREE.MeshBasicMaterial,
    slot: ArmourSlot,
    part: string,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material);
    // Skin remains renderOrder 0; armour follows it while retaining depth tests.
    mesh.renderOrder = 1;
    mesh.visible = false;
    mesh.userData.armourSlot = slot;
    mesh.userData.armourPart = part;
    return mesh;
  }
}
