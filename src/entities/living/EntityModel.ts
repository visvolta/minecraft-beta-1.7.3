import { BoxGeometry, Color, Group, Mesh, MeshBasicMaterial } from 'three';
import { attachEntityLighting } from '../../rendering/ChunkRenderer';

/** Model space: 16 pixels per block, y up, origin at the entity's feet. */
export const PX = 1 / 16;

/** Target colour for the hurt flash (reused; no per-frame allocation). */
const HURT_FLASH_RED = new Color(1, 0, 0);

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** A box primitive spec in pixel units. */
export interface BoxSpec {
  readonly w: number;
  readonly h: number;
  readonly d: number;
}

interface FlashMaterial {
  readonly material: MeshBasicMaterial;
  readonly baseColor: Color;
}

/**
 * Common base for procedural entity models: the entity-lit material pipeline,
 * box construction, the shared hurt flash, and disposal. Concrete models
 * (quadruped, bird) add their own structure and animation on top. Owns no
 * entity logic.
 */
export abstract class EntityModel {
  public readonly root = new Group();

  protected readonly flashMaterials: FlashMaterial[] = [];
  protected readonly geometries: BoxGeometry[] = [];

  /**
   * Creates an entity-lit material and registers it for the hurt flash and
   * disposal. Every model part should obtain its material through here.
   */
  protected createMaterial(color: number): MeshBasicMaterial {
    const material = new MeshBasicMaterial({ color });
    attachEntityLighting(material);
    this.flashMaterials.push({ material, baseColor: material.color.clone() });
    return material;
  }

  /** Adds a box mesh (pixel dimensions) to a group at a pixel position. */
  protected addBox(
    group: Group,
    spec: BoxSpec,
    material: MeshBasicMaterial,
    xPixels: number,
    yPixels: number,
    zPixels: number,
  ): Mesh {
    const geometry = new BoxGeometry(spec.w * PX, spec.h * PX, spec.d * PX);
    this.geometries.push(geometry);
    const mesh = new Mesh(geometry, material);
    mesh.position.set(xPixels * PX, yPixels * PX, zPixels * PX);
    group.add(mesh);
    return mesh;
  }

  /**
   * Recolours a material created via {@link createMaterial} and updates its
   * stored flash base colour, so the hurt flash still lerps from the new base.
   * Used for runtime colour changes such as a sheep's fleece.
   */
  protected recolorMaterial(material: MeshBasicMaterial, colorHex: number): void {
    material.color.set(colorHex);
    for (const entry of this.flashMaterials) {
      if (entry.material === material) {
        entry.baseColor.copy(material.color);
        break;
      }
    }
  }

  /**
   * Tints every registered material toward red for the hurt flash. `amount` is
   * 0 (base colours) to 1 (full red). Mutates existing materials only — no new
   * material is created and base colours are fully restored at 0.
   */
  public setHurtFlash(amount: number): void {
    const a = clamp01(amount);
    for (const { material, baseColor } of this.flashMaterials) {
      material.color.copy(baseColor).lerp(HURT_FLASH_RED, a);
    }
  }

  public dispose(): void {
    for (const geometry of this.geometries) {
      geometry.dispose();
    }
    this.geometries.length = 0;
    for (const { material } of this.flashMaterials) {
      material.dispose();
    }
    this.flashMaterials.length = 0;
  }
}
