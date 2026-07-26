import * as THREE from 'three';
import type { AnimatedIconFrames } from '../inventory/AnimatedIconFrames';
import { DEFAULT_ITEM_DEFINITIONS } from '../items/ItemDefinitionRegistry';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { TextureAtlas } from '../assets/TextureAtlas';
import type { ItemTextureAtlas } from '../assets/ItemTextureAtlas';
import type { ItemStack } from '../inventory/ItemStack';
import { presentationFor } from '../inventory/ItemRenderDefinition';
import { IsolatedBlockModelBuilder } from '../inventory/IsolatedBlockModelBuilder';
import { SpriteModelBuilder } from '../inventory/SpriteModelBuilder';
import { ItemIconResolver } from '../inventory/ItemIconResolver';
import { attachEntityLighting } from './ChunkRenderer';
import { applyEntityRenderOrder } from './RenderOrder';
import {
  THIRD_PERSON_BLOCK_POSITION, THIRD_PERSON_BLOCK_ROTATION, THIRD_PERSON_BLOCK_SCALE,
  THIRD_PERSON_FLAT_POSITION, THIRD_PERSON_FLAT_ROTATION, THIRD_PERSON_FLAT_SCALE,
  THIRD_PERSON_TOOL_POSITION, THIRD_PERSON_TOOL_ROTATION, THIRD_PERSON_TOOL_SCALE,
  THIRD_PERSON_BOW_POSITION, THIRD_PERSON_BOW_ROTATION, THIRD_PERSON_BOW_SCALE,
  THIRD_PERSON_ROD_POSITION, THIRD_PERSON_ROD_ROTATION, THIRD_PERSON_ROD_SCALE,
  ROD_TIP_OFFSET,
} from '../player/PlayerConstants.ts';
import { classifyItemRender, isToolCategory } from '../inventory/ItemRenderClassifier';

/** Held-item transform categories, each fully configured from PlayerConstants. */
interface HeldTransform {
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly scale: number;
}

const BLOCK_TRANSFORM: HeldTransform = {
  position: THIRD_PERSON_BLOCK_POSITION, rotation: THIRD_PERSON_BLOCK_ROTATION, scale: THIRD_PERSON_BLOCK_SCALE,
};
const FLAT_TRANSFORM: HeldTransform = {
  position: THIRD_PERSON_FLAT_POSITION, rotation: THIRD_PERSON_FLAT_ROTATION, scale: THIRD_PERSON_FLAT_SCALE,
};
const TOOL_TRANSFORM: HeldTransform = {
  position: THIRD_PERSON_TOOL_POSITION, rotation: THIRD_PERSON_TOOL_ROTATION, scale: THIRD_PERSON_TOOL_SCALE,
};
const BOW_TRANSFORM: HeldTransform = {
  position: THIRD_PERSON_BOW_POSITION, rotation: THIRD_PERSON_BOW_ROTATION, scale: THIRD_PERSON_BOW_SCALE,
};
const ROD_TRANSFORM: HeldTransform = {
  position: THIRD_PERSON_ROD_POSITION, rotation: THIRD_PERSON_ROD_ROTATION, scale: THIRD_PERSON_ROD_SCALE,
};

/**
 * Renders the item held in the player's right hand in third person.
 *
 * Beta draws this in `RenderPlayer.renderEquippedItems` by translating into
 * the biped's right-arm space and drawing the item there, so the item
 * inherits the arm's swing and attack animation for free. This renderer does
 * the same by parenting to `PlayerModel.rightHandAttachment`.
 *
 * Item classification is shared with the first-person renderer through
 * `presentationFor`, so a block held in first person is a block in third
 * person too — only the transform differs. Clock and compass read their frame
 * from the same shared `AnimatedIconFrames` instance the hotbar and inventory
 * use, so all surfaces show one consistent frame.
 */
export class ThirdPersonHeldItemRenderer {
  public readonly root = new THREE.Group();
  private mesh: THREE.Mesh | null = null;
  private key = '';
  private readonly blockMaterial: THREE.MeshBasicMaterial;
  private readonly spriteMaterial: THREE.MeshBasicMaterial;
  private readonly icons = new ItemIconResolver();
  /**
   * Anchor at the tip of a held fishing rod. The fishing line is attached
   * here so it leaves the rod rather than the player's body.
   */
  public readonly rodTip = new THREE.Group();

  public constructor(
    handAttachment: THREE.Object3D,
    private readonly blocks: BlockRegistry,
    private readonly atlas: TextureAtlas,
    items: ItemTextureAtlas,
    private readonly animatedIcons?: AnimatedIconFrames,
  ) {
    handAttachment.add(this.root);
    this.rodTip.position.set(...ROD_TIP_OFFSET);
    handAttachment.add(this.rodTip);
    this.blockMaterial = new THREE.MeshBasicMaterial({
      map: atlas.texture,
      vertexColors: true,
      alphaTest: 0.1,
      transparent: true,
    });
    this.spriteMaterial = new THREE.MeshBasicMaterial({
      map: items.texture,
      alphaTest: 0.1,
      transparent: true,
      side: THREE.DoubleSide,
    });
    attachEntityLighting(this.blockMaterial);
    attachEntityLighting(this.spriteMaterial);
  }

  /** Current frame URL for clock/compass, or null for any other item. */
  private animatedFrameUrl(id: string | number): string | null {
    const frames = this.animatedIcons;
    if (frames === undefined) return null;
    const definition = DEFAULT_ITEM_DEFINITIONS.get(id);
    const name = definition?.id ?? String(id);
    if (!frames.isAnimated(name)) return null;
    return frames.getCurrentFrameUrl(name);
  }

  /**
   * Rebuilds the held model when the stack (or an animated frame) changes.
   * Returns whether anything is currently held.
   */
  public update(stack: ItemStack | null): boolean {
    const definition = stack ? DEFAULT_ITEM_DEFINITIONS.get(stack.identity.id) : undefined;
    const animatedName = definition?.id ?? (stack ? String(stack.identity.id) : '');
    const frameTag = this.animatedIcons?.isAnimated(animatedName) === true
      ? `:${this.animatedIcons.getFrame(animatedName)}`
      : '';
    const key = stack ? `${stack.identity.type}:${stack.identity.id}:${stack.metadata}${frameTag}` : '';
    if (key === this.key) return stack !== null;
    this.key = key;

    this.disposeMesh();
    if (stack === null) return false;

    const presentation = presentationFor(stack.identity, this.blocks);
    const transform = this.transformFor(stack);
    if (presentation.kind === 'block') {
      const blockDefinition = this.blocks.getById(stack.identity.id);
      if (blockDefinition === undefined) return false;
      this.mesh = new THREE.Mesh(
        IsolatedBlockModelBuilder.build(blockDefinition, this.atlas, stack.metadata),
        this.blockMaterial,
      );
      this.mesh.position.set(...transform.position);
      this.mesh.rotation.set(...transform.rotation);
      this.mesh.scale.setScalar(transform.scale);
    } else {
      // Animated icons must use the shared current frame, never the strip.
      const iconUrl = this.animatedFrameUrl(stack.identity.id)
        ?? this.icons.resolve(String(stack.identity.id));
      const texture = new THREE.TextureLoader().load(iconUrl);
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      texture.colorSpace = THREE.SRGBColorSpace;
      const material = this.spriteMaterial.clone();
      material.map = texture;
      this.mesh = new THREE.Mesh(
        SpriteModelBuilder.build(0, 0, 1, 1, Boolean(presentation.flipHeldHorizontal)),
        material,
      );
      this.mesh.userData.ownedTexture = texture;
      this.mesh.userData.ownedMaterial = material;
      this.mesh.position.set(...transform.position);
      this.mesh.rotation.set(...transform.rotation);
      this.mesh.scale.setScalar(transform.scale);
    }

    this.root.add(this.mesh);
    // The item is a new child of an already-parented tree, so it needs the
    // entity render layer or it disappears behind water.
    applyEntityRenderOrder(this.root);
    return true;
  }

  public updateLighting(
    skyLight: number,
    blockLight: number,
    skylightSubtracted: number,
    sunBrightnessFactor: number,
  ): void {
    const materials: THREE.MeshBasicMaterial[] = [this.blockMaterial, this.spriteMaterial];
    if (this.mesh?.material instanceof THREE.MeshBasicMaterial && !materials.includes(this.mesh.material)) {
      materials.push(this.mesh.material);
    }
    for (const material of materials) {
      const uniforms = material.userData.dynamicLightingUniforms as {
        uStaticSkyLight?: { value: number };
        uStaticBlockLight?: { value: number };
        uSkylightSubtracted?: { value: number };
        uSunBrightnessFactor?: { value: number };
      } | undefined;
      if (uniforms?.uStaticSkyLight && uniforms.uStaticBlockLight
        && uniforms.uSkylightSubtracted && uniforms.uSunBrightnessFactor) {
        uniforms.uStaticSkyLight.value = skyLight;
        uniforms.uStaticBlockLight.value = blockLight;
        uniforms.uSkylightSubtracted.value = skylightSubtracted;
        uniforms.uSunBrightnessFactor.value = sunBrightnessFactor;
      }
    }
  }

  /** Hides the held item (used while the player model itself is hidden). */
  public setVisible(visible: boolean): void {
    this.root.visible = visible;
  }

  /**
   * Selects the Beta transform branch for a stack. Beta picks between its
   * 3D-block, full-3D (tools/swords) and flat-item paths; bow and fishing rod
   * get their own tuned entries so they can be adjusted independently.
   */
  private transformFor(stack: ItemStack): HeldTransform {
    const definition = DEFAULT_ITEM_DEFINITIONS.get(stack.identity.id);
    const id = definition?.id ?? String(stack.identity.id);
    if (id === 'bow' || id.startsWith('bow_')) return BOW_TRANSFORM;
    if (id === 'fishing_rod' || id.startsWith('fishing_rod')) return ROD_TRANSFORM;
    const presentation = presentationFor(stack.identity, this.blocks);
    if (presentation.kind === 'block') return BLOCK_TRANSFORM;
    if (isToolCategory(classifyItemRender(stack.identity, this.blocks))) return TOOL_TRANSFORM;
    return FLAT_TRANSFORM;
  }

  /** True when the current stack is a fishing rod (line anchors at the tip). */
  public isHoldingRod(stack: ItemStack | null): boolean {
    if (stack === null) return false;
    const id = DEFAULT_ITEM_DEFINITIONS.get(stack.identity.id)?.id ?? String(stack.identity.id);
    return id === 'fishing_rod' || id.startsWith('fishing_rod');
  }

  private disposeMesh(): void {
    if (this.mesh === null) return;
    this.root.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.userData.ownedMaterial as THREE.Material | undefined)?.dispose();
    (this.mesh.userData.ownedTexture as THREE.Texture | undefined)?.dispose();
    this.mesh = null;
  }

  public dispose(): void {
    this.disposeMesh();
    this.root.removeFromParent();
    this.blockMaterial.dispose();
    this.spriteMaterial.dispose();
  }
}
