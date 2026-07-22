import * as THREE from 'three';
import { readFileSync, existsSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import {
  ArmourTextureAssets,
  armourTextureLayerForSlot,
  configureArmourTexture,
  type ArmourTextureKey,
} from '../src/assets/ArmourTextureAssets.ts';
import { ARMOUR_MATERIALS, ARMOUR_SLOTS, type ArmourMaterialId, type ArmourSlot } from '../src/items/ArmourMaterial.ts';
import { ArmourGeometryCache } from '../src/rendering/armour/ArmourGeometryCache.ts';
import { ArmourMaterialCache } from '../src/rendering/armour/ArmourMaterialCache.ts';
import { PlayerArmourRenderer } from '../src/player/PlayerArmourRenderer.ts';
import { PlayerModel } from '../src/player/PlayerModel.ts';
import { PlayerSkinManager } from '../src/player/PlayerSkinManager.ts';
import { PlayerAnimator } from '../src/player/PlayerAnimator.ts';
import { Player } from '../src/player/Player.ts';
import { Inventory } from '../src/inventory/Inventory.ts';
import { InventorySerializer } from '../src/inventory/InventorySerializer.ts';
import { ItemStack } from '../src/inventory/ItemStack.ts';
import { PLAYER_MODEL_SCALE } from '../src/player/PlayerConstants.ts';

function assert(value: boolean, message: string): void {
  if (!value) throw new Error(message);
}

interface PngAudit {
  readonly width: number;
  readonly height: number;
  readonly transparent: number;
  readonly opaque: number;
  readonly partial: number;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Minimal 8-bit RGBA PNG audit used only to verify supplied alpha pixels. */
function auditRgbaPng(path: string): PngAudit {
  const bytes = readFileSync(path);
  assert(bytes.toString('ascii', 1, 4) === 'PNG', `${path} PNG signature`);
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  assert(bytes[24] === 8 && bytes[25] === 6, `${path} is 8-bit RGBA`);
  const idat: Buffer[] = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') idat.push(bytes.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const decoded = Buffer.alloc(stride * height);
  let sourceOffset = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[sourceOffset++]!;
    for (let x = 0; x < stride; x++) {
      const rawValue = raw[sourceOffset++]!;
      const left = x >= 4 ? decoded[y * stride + x - 4]! : 0;
      const above = y > 0 ? decoded[(y - 1) * stride + x]! : 0;
      const upperLeft = y > 0 && x >= 4 ? decoded[(y - 1) * stride + x - 4]! : 0;
      let value = rawValue;
      if (filter === 1) value += left;
      else if (filter === 2) value += above;
      else if (filter === 3) value += Math.floor((left + above) / 2);
      else if (filter === 4) value += paeth(left, above, upperLeft);
      else assert(filter === 0, `${path} supported PNG filter`);
      decoded[y * stride + x] = value & 0xff;
    }
  }
  let transparent = 0;
  let opaque = 0;
  let partial = 0;
  for (let i = 3; i < decoded.length; i += 4) {
    const alpha = decoded[i]!;
    if (alpha === 0) transparent++;
    else if (alpha === 255) opaque++;
    else partial++;
  }
  return { width, height, transparent, opaque, partial };
}

function makeTextureAssets(): ArmourTextureAssets {
  const textures = new Map<ArmourTextureKey, THREE.Texture>();
  for (const material of Object.keys(ARMOUR_MATERIALS) as ArmourMaterialId[]) {
    for (const layer of [1, 2] as const) {
      textures.set(`${material}:${layer}`, new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1));
    }
  }
  return ArmourTextureAssets.fromTextures(textures);
}

function armour(id: string, damage = 0): ItemStack {
  return new ItemStack(id, 'item', 1, 0, damage);
}

function createRenderer(
  model: PlayerModel,
  inventory: Inventory,
  geometry: ArmourGeometryCache,
  materials: ArmourMaterialCache,
): PlayerArmourRenderer {
  return new PlayerArmourRenderer({
    head: model.headGroup,
    body: model.bodyGroup,
    rightArm: model.rightArmGroup,
    leftArm: model.leftArmGroup,
    rightLeg: model.rightLegGroup,
    leftLeg: model.leftLegGroup,
  }, inventory.getEquipment()!, geometry, materials);
}

function geometrySizePixels(geometry: THREE.BoxGeometry): THREE.Vector3 {
  geometry.computeBoundingBox();
  const result = new THREE.Vector3();
  geometry.boundingBox!.getSize(result);
  return result.multiplyScalar(1 / PLAYER_MODEL_SCALE);
}

function assertSize(geometry: THREE.BoxGeometry, expected: readonly [number, number, number], label: string): void {
  const size = geometrySizePixels(geometry);
  assert(Math.abs(size.x - expected[0]) < 1e-6, `${label} width`);
  assert(Math.abs(size.y - expected[1]) < 1e-6, `${label} height`);
  assert(Math.abs(size.z - expected[2]) < 1e-6, `${label} depth`);
}

function assertOnlySlotVisible(renderer: PlayerArmourRenderer, slot: ArmourSlot): void {
  for (const candidate of ARMOUR_SLOTS) {
    const expected = candidate === slot;
    assert(renderer.getMeshes(candidate).every((mesh) => mesh.visible === expected), `${slot}-only ${candidate} visibility`);
  }
}

function testAssetsAndMaterials(): void {
  for (const material of ['leather', 'chainmail', 'iron', 'gold', 'diamond']) {
    for (const layer of [1, 2]) {
      const audit = auditRgbaPng(`public/textures/armour/${material}_layer_${layer}.png`);
      assert(audit.width === 64 && audit.height === 32, `${material} layer ${layer} native 64x32`);
      assert(audit.transparent > 0 && audit.opaque > 0, `${material} layer ${layer} preserves transparent and opaque pixels`);
    }
  }
  const chain1 = auditRgbaPng('public/textures/armour/chainmail_layer_1.png');
  const chain2 = auditRgbaPng('public/textures/armour/chainmail_layer_2.png');
  assert(chain1.partial === 0 && chain2.partial === 0, 'chainmail uses binary cutout alpha');
  assert(!existsSync('public/textures/armour/leather_layer_1_overlay.png') && !existsSync('public/textures/armour/leather_layer_2_overlay.png'), 'leather overlay files intentionally excluded');

  const texture = new THREE.Texture();
  configureArmourTexture(texture);
  assert(texture.magFilter === THREE.NearestFilter && texture.minFilter === THREE.NearestFilter, 'armour nearest-neighbour filtering');
  assert(!texture.generateMipmaps && !texture.flipY && texture.colorSpace === THREE.SRGBColorSpace, 'armour texture no mipmaps, no flip, sRGB');
  texture.dispose();

  assert(armourTextureLayerForSlot('helmet') === 1 && armourTextureLayerForSlot('chestplate') === 1 && armourTextureLayerForSlot('boots') === 1, 'helmet/chest/boots use layer one');
  assert(armourTextureLayerForSlot('leggings') === 2, 'leggings use layer two');

  const assets = makeTextureAssets();
  const materials = new ArmourMaterialCache(assets);
  assert(assets.size === 10 && materials.size === 10, 'ten textures and ten cached materials');
  for (const material of Object.keys(ARMOUR_MATERIALS) as ArmourMaterialId[]) {
    for (const layer of [1, 2] as const) {
      const renderMaterial = materials.get(material, layer);
      assert(renderMaterial.transparent && renderMaterial.alphaTest === 0.1, `${material}:${layer} transparent alpha-tested`);
      assert(renderMaterial.depthTest && renderMaterial.depthWrite, `${material}:${layer} depth test/write retained`);
      assert(renderMaterial.map === assets.get(material, layer), `${material}:${layer} uses cached texture`);
    }
  }
  materials.dispose();
  assets.dispose();
}

function testGeometryAndUvs(): void {
  const skin = new PlayerSkinManager();
  const geometry = new ArmourGeometryCache(skin);
  assert(geometry.size === 10, 'ten distinct shared armour geometries');
  assertSize(geometry.helmet.head, [10, 10, 10], 'helmet head +1');
  assertSize(geometry.helmet.headwear, [11, 11, 11], 'helmet headwear +1.5');
  assertSize(geometry.chest.body, [10, 14, 6], 'chest body +1');
  assertSize(geometry.chest.rightArm, [6, 14, 6], 'chest arm +1');
  assertSize(geometry.leggings.body, [9, 13, 5], 'leggings body +0.5');
  assertSize(geometry.leggings.rightLeg, [5, 13, 5], 'leggings leg +0.5');
  assertSize(geometry.boots.rightLeg, [6, 14, 6], 'boots leg +1');

  for (const part of [
    geometry.helmet.head, geometry.helmet.headwear, geometry.chest.body,
    geometry.chest.rightArm, geometry.chest.leftArm, geometry.leggings.body,
    geometry.leggings.rightLeg, geometry.leggings.leftLeg,
    geometry.boots.rightLeg, geometry.boots.leftLeg,
  ]) {
    const uv = part.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      assert(uv.getX(i) >= 0 && uv.getX(i) <= 1 && uv.getY(i) >= 0 && uv.getY(i) <= 1, 'armour UV remains in 64x32 atlas range');
    }
  }

  const rightArmUv = geometry.chest.rightArm.getAttribute('uv') as THREE.BufferAttribute;
  const leftArmUv = geometry.chest.leftArm.getAttribute('uv') as THREE.BufferAttribute;
  assert(rightArmUv.getX(20) < rightArmUv.getX(21) && leftArmUv.getX(20) > leftArmUv.getX(21), 'chest arm front UV orientation mirrors left/right');
  const rightLegUv = geometry.leggings.rightLeg.getAttribute('uv') as THREE.BufferAttribute;
  const leftLegUv = geometry.leggings.leftLeg.getAttribute('uv') as THREE.BufferAttribute;
  assert(rightLegUv.getX(20) < rightLegUv.getX(21) && leftLegUv.getX(20) > leftLegUv.getX(21), 'legging front UV orientation mirrors left/right');
  const rightBootUv = geometry.boots.rightLeg.getAttribute('uv') as THREE.BufferAttribute;
  const leftBootUv = geometry.boots.leftLeg.getAttribute('uv') as THREE.BufferAttribute;
  assert(rightBootUv.getX(20) < rightBootUv.getX(21) && leftBootUv.getX(20) > leftBootUv.getX(21), 'boot front UV orientation mirrors left/right');
  geometry.dispose();
}

function testVisibilityCachingAndEquipmentFlow(): void {
  const assets = makeTextureAssets();
  const materials = new ArmourMaterialCache(assets);
  const geometry = new ArmourGeometryCache(new PlayerSkinManager());
  const firstModel = new PlayerModel();
  const secondModel = new PlayerModel();
  const firstInventory = new Inventory();
  const secondInventory = new Inventory();
  const first = createRenderer(firstModel, firstInventory, geometry, materials);
  const second = createRenderer(secondModel, secondInventory, geometry, materials);
  assert(first.meshCount === 10 && second.meshCount === 10, 'each Player creates ten mesh instances once');
  for (const slot of ARMOUR_SLOTS) {
    const firstMeshes = first.getMeshes(slot);
    const secondMeshes = second.getMeshes(slot);
    for (let i = 0; i < firstMeshes.length; i++) assert(firstMeshes[i]!.geometry === secondMeshes[i]!.geometry, `${slot} geometry shared across Players`);
    assert(firstMeshes.every((mesh) => !mesh.visible && mesh.renderOrder === 1), `${slot} initially hidden and ordered after skin`);
  }

  const equipment = firstInventory.getEquipment()!;
  for (const [slot, id] of [
    ['helmet', 'iron_helmet'],
    ['chestplate', 'iron_chestplate'],
    ['leggings', 'iron_leggings'],
    ['boots', 'iron_boots'],
  ] as const) {
    equipment.clear();
    equipment.setStack(slot, armour(id));
    assert(first.sync(), `${slot} equipment revision updates renderer`);
    assertOnlySlotVisible(first, slot);
    const expectedLayer = armourTextureLayerForSlot(slot);
    assert(first.getMeshes(slot).every((mesh) => mesh.material === materials.get('iron', expectedLayer)), `${slot} selects iron layer ${expectedLayer}`);
  }

  equipment.clear();
  equipment.setStack('helmet', armour('iron_helmet'));
  secondInventory.getEquipment()!.setStack('helmet', armour('iron_helmet'));
  first.sync();
  second.sync();
  assert(first.getMeshes('helmet')[0]!.material === second.getMeshes('helmet')[0]!.material, 'cached armour material shared across Players');

  equipment.clear();
  equipment.setStack('helmet', armour('leather_helmet'));
  equipment.setStack('chestplate', armour('chainmail_chestplate'));
  equipment.setStack('leggings', armour('diamond_leggings'));
  equipment.setStack('boots', armour('gold_boots'));
  first.sync();
  assert(first.getMeshes('helmet').every((mesh) => mesh.material === materials.get('leather', 1)), 'mixed set leather helmet material');
  assert(first.getMeshes('chestplate').every((mesh) => mesh.material === materials.get('chain', 1)), 'mixed set chain chest material');
  assert(first.getMeshes('leggings').every((mesh) => mesh.material === materials.get('diamond', 2)), 'mixed set diamond leggings layer two');
  assert(first.getMeshes('boots').every((mesh) => mesh.material === materials.get('gold', 1)), 'mixed set gold boots layer one');

  const helmetMeshes = [...first.getMeshes('helmet')];
  const helmetGeometries = helmetMeshes.map((mesh) => mesh.geometry);
  equipment.setStack('helmet', armour('diamond_helmet'));
  first.sync();
  assert(first.getMeshes('helmet').every((mesh, i) => mesh === helmetMeshes[i] && mesh.geometry === helmetGeometries[i]), 'material swap keeps helmet meshes and geometry alive');
  assert(first.getMeshes('helmet').every((mesh) => mesh.material === materials.get('diamond', 1)), 'iron/leather to diamond swaps cached material reference only');
  assert(!first.sync(), 'unchanged equipment revision performs no render update');

  equipment.setStack('helmet', null);
  first.sync();
  assert(first.getMeshes('helmet').every((mesh) => !mesh.visible), 'removing armour hides existing meshes');
  equipment.setStack('boots', armour('gold_boots', 77));
  const boots = equipment.getStack('boots')!;
  boots.damage = boots.getMaxDurability() - 1;
  equipment.damageArmour(1);
  first.sync();
  assert(first.getMeshes('boots').every((mesh) => !mesh.visible), 'broken armour disappears on equipment revision');

  const savedInventory = new Inventory();
  savedInventory.getEquipment()!.setStack('chestplate', armour('diamond_chestplate', 50));
  const saved = InventorySerializer.serialize(savedInventory);
  const loadedInventory = new Inventory();
  InventorySerializer.deserialize(loadedInventory, saved.inventory, saved.armour);
  const loadedModel = new PlayerModel();
  const loaded = createRenderer(loadedModel, loadedInventory, geometry, materials);
  assert(loaded.getMeshes('chestplate').every((mesh) => mesh.visible && mesh.material === materials.get('diamond', 1)), 'save restoration renders restored equipment immediately');
  loadedInventory.getEquipment()!.clear();
  loaded.sync();
  assert(loaded.getMeshes('chestplate').every((mesh) => !mesh.visible), 'death-style equipment clear hides armour immediately');

  firstModel.setFirstPersonMode(true);
  assert(!firstModel.headGroup.visible && !firstModel.bodyGroup.visible && !firstModel.leftArmGroup.visible && !firstModel.rightArmGroup.visible && !firstModel.leftLegGroup.visible && !firstModel.rightLegGroup.visible, 'first-person hides all Player and armour parent groups');
  firstModel.setFirstPersonMode(false);
  assert(firstModel.headGroup.visible && firstModel.bodyGroup.visible && firstModel.leftArmGroup.visible && firstModel.rightArmGroup.visible && firstModel.leftLegGroup.visible && firstModel.rightLegGroup.visible, 'third-person restores all Player and armour parent groups');

  const sharedMaterial = materials.get('iron', 1);
  const sharedGeometry = geometry.chest.body;
  let sharedMaterialDisposals = 0;
  let sharedGeometryDisposals = 0;
  sharedMaterial.addEventListener('dispose', () => sharedMaterialDisposals++);
  sharedGeometry.addEventListener('dispose', () => sharedGeometryDisposals++);
  first.dispose();
  second.dispose();
  loaded.dispose();
  assert(sharedMaterialDisposals === 0, 'disposing Players does not dispose shared materials');
  firstModel.dispose();
  secondModel.dispose();
  loadedModel.dispose();
  assert(sharedGeometryDisposals === 0, 'disposing Players does not dispose shared geometry');
  geometry.dispose();
  assert(sharedGeometryDisposals === 1, 'engine-owned geometry cache disposes shared geometry once');
  materials.dispose();
  assert(sharedMaterialDisposals === 1, 'engine-owned material cache disposes shared material once');
  assets.dispose();
}

function testAnimationAlignmentAndSeams(): void {
  const assets = makeTextureAssets();
  const materials = new ArmourMaterialCache(assets);
  const geometry = new ArmourGeometryCache(new PlayerSkinManager());
  const model = new PlayerModel();
  const inventory = new Inventory();
  const equipment = inventory.getEquipment()!;
  equipment.setStack('helmet', armour('diamond_helmet'));
  equipment.setStack('chestplate', armour('diamond_chestplate'));
  equipment.setStack('leggings', armour('diamond_leggings'));
  equipment.setStack('boots', armour('diamond_boots'));
  const renderer = createRenderer(model, inventory, geometry, materials);
  const animator = new PlayerAnimator();
  const player = new Player(0, 0, 0);
  player.grounded = true;

  const skinHead = model.headGroup.children[0] as THREE.Mesh;
  const helmet = renderer.getMeshes('helmet')[0]!;
  assert(helmet.parent === model.headGroup && helmet.position.equals(skinHead.position), 'helmet shares head pivot and centre');
  const skinHeadSize = geometrySizePixels(skinHead.geometry as THREE.BoxGeometry);
  const helmetSize = geometrySizePixels(helmet.geometry as THREE.BoxGeometry);
  assert(helmetSize.x > skinHeadSize.x && helmetSize.y > skinHeadSize.y && helmetSize.z > skinHeadSize.z, 'helmet encloses Player head without clipping');
  for (const pitch of [-Math.PI / 2, Math.PI / 2]) {
    model.headGroup.rotation.x = pitch;
    model.root.updateMatrixWorld(true);
    assert(helmet.parent === model.headGroup && helmet.position.equals(skinHead.position), 'helmet remains aligned while looking fully up/down');
  }

  const chestArm = renderer.getMeshes('chestplate')[1]!;
  const armLocalPosition = chestArm.position.clone();
  for (let step = 0; step <= 32; step++) {
    player.armAction = 'breaking';
    player.prevBreakingSwingPhase = Math.max(0, (step - 1) / 32);
    player.breakingSwingPhase = step / 32;
    animator.update(player, model, 0, 0, 1);
    model.root.updateMatrixWorld(true);
    assert(chestArm.parent === model.rightArmGroup && chestArm.position.equals(armLocalPosition), `chest arm aligned through mining swing ${step}`);
  }

  player.armAction = 'none';
  player.velocity.x = 4;
  player.limbSwingAmount = player.prevLimbSwingAmount = 1;
  const legging = renderer.getMeshes('leggings')[1]!;
  const boot = renderer.getMeshes('boots')[0]!;
  for (const phase of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    player.limbSwingPhase = player.prevLimbSwingPhase = phase;
    animator.update(player, model, 0, 0, 1);
    model.root.updateMatrixWorld(true);
    assert(legging.parent === model.rightLegGroup && boot.parent === model.rightLegGroup, 'leggings and boots share authoritative leg pivot at maximum stride');
    assert(legging.position.equals(boot.position), 'leggings and boots remain concentric during stride');
  }
  const leggingSize = geometrySizePixels(legging.geometry as THREE.BoxGeometry);
  const bootSize = geometrySizePixels(boot.geometry as THREE.BoxGeometry);
  assert(bootSize.x - leggingSize.x === 1 && bootSize.y - leggingSize.y === 1 && bootSize.z - leggingSize.z === 1, 'boots remain 0.5px per side outside leggings without z-fighting');

  const chestBody = renderer.getMeshes('chestplate')[0]!;
  const chestRightArm = renderer.getMeshes('chestplate')[1]!;
  const bodyHalfWidth = geometrySizePixels(chestBody.geometry as THREE.BoxGeometry).x / 2;
  const armHalfWidth = geometrySizePixels(chestRightArm.geometry as THREE.BoxGeometry).x / 2;
  const armPivotPixels = model.rightArmGroup.position.x / PLAYER_MODEL_SCALE;
  assert(armPivotPixels - armHalfWidth < bodyHalfWidth, 'chest torso and right arm overlap at seam');
  const leggingsBody = renderer.getMeshes('leggings')[0]!;
  const leggingsLeg = renderer.getMeshes('leggings')[1]!;
  const bodyBottom = model.bodyGroup.position.y / PLAYER_MODEL_SCALE + leggingsBody.position.y / PLAYER_MODEL_SCALE - geometrySizePixels(leggingsBody.geometry as THREE.BoxGeometry).y / 2;
  const legTop = model.rightLegGroup.position.y / PLAYER_MODEL_SCALE + leggingsLeg.position.y / PLAYER_MODEL_SCALE + geometrySizePixels(leggingsLeg.geometry as THREE.BoxGeometry).y / 2;
  assert(bodyBottom < legTop, 'legging torso and legs overlap at waist seam');

  renderer.dispose();
  model.dispose();
  geometry.dispose();
  materials.dispose();
  assets.dispose();
}

function main(): void {
  testAssetsAndMaterials();
  testGeometryAndUvs();
  testVisibilityCachingAndEquipmentFlow();
  testAnimationAlignmentAndSeams();
  console.log('Armour rendering assets, layers, geometry, UVs, caching, visibility and animation validation passed.');
}

main();
