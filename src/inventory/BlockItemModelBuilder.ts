import * as THREE from 'three';
import type { BlockDefinition } from '../blocks/BlockDefinition';
import type { TextureAtlas } from '../assets/TextureAtlas';
import { resolveBlockTexture, getSemanticFace, resolveSlabTexture } from '../blocks/resolveBlockTexture';
import { resolveBlockTint } from '../blocks/resolveBlockTint';
import { FaceDirection } from '../blocks/BlockFace';
import { BlockIds } from '../blocks/BlockId';

/**
 * Centralized, authoritative builder for isolated and inventory 3D block geometries.
 * Guarantees consistent model rendering in both slot icons and first-person hand view.
 */
export class BlockItemModelBuilder {
  public static build3DGeometry(def: BlockDefinition, atlas: TextureAtlas, metadata = 0): THREE.BufferGeometry {
    const id = def.id;

    if (id === BlockIds.Slab) {
      // Single Slab: bottom half-cube
      return this.buildCustomBoxGeometry(1.0, 0.5, 1.0, 0, def, atlas, metadata);
    }

    if (id === BlockIds.DoubleSlab) {
      // Double Slab: full cube
      return this.buildCustomBoxGeometry(1.0, 1.0, 1.0, 0, def, atlas, metadata);
    }

    if (id === BlockIds.Trapdoor) {
      // Trapdoor: thin panel
      return this.buildCustomBoxGeometry(1.0, 3 / 16, 1.0, 0, def, atlas);
    }

    if (id === BlockIds.WoodPressurePlate || id === BlockIds.StonePressurePlate) {
      // Pressure Plates: very thin flat model
      return this.buildCustomBoxGeometry(14 / 16, 1 / 16, 14 / 16, 0, def, atlas);
    }

    if (id === BlockIds.StoneButton) {
      // Button: tiny rectangular button block
      return this.buildCustomBoxGeometry(6 / 16, 4 / 16, 2 / 16, 0, def, atlas);
    }

    if (id === BlockIds.Lever) {
      // Lever: base block + angled stick
      const base = this.buildCustomBoxGeometry(4 / 16, 3 / 16, 4 / 16, -2 / 16, def, atlas);
      const stick = this.buildCustomBoxGeometry(1 / 16, 8 / 16, 1 / 16, 3 / 16, def, atlas);
      stick.rotateX(Math.PI / 6); // Angled lever stick
      const merged = this.mergeGeometries([base, stick]);
      base.dispose();
      stick.dispose();
      return merged;
    }

    // Default: full 1x1x1 cube
    return this.buildCustomBoxGeometry(1.0, 1.0, 1.0, 0, def, atlas);
  }

  public static buildCustomBoxGeometry(
    width: number,
    height: number,
    depth: number,
    offsetY: number,
    def: BlockDefinition,
    atlas: TextureAtlas,
    metadata = 0
  ): THREE.BufferGeometry {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    if (offsetY !== 0) {
      geometry.translate(0, offsetY, 0);
    }
    const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
    const colors = new Float32Array(24 * 3);
    const faces: Array<FaceDirection> = [
      FaceDirection.EAST,
      FaceDirection.WEST,
      FaceDirection.TOP,
      FaceDirection.BOTTOM,
      FaceDirection.SOUTH,
      FaceDirection.NORTH,
    ];

    for (let face = 0; face < 6; face++) {
      const dir = faces[face]!;
      const slot = getSemanticFace(dir, 3);
      
      let name = resolveBlockTexture(def, slot);
      // For slabs, resolve texture using centralized, strictly normalized resolver
      if (def.id === BlockIds.Slab || def.id === BlockIds.DoubleSlab) {
        name = resolveSlabTexture(slot === 'front' ? 'side' : (slot === 'back' ? 'side' : slot), metadata);
      }

      const rect = name ? atlas.getUvRect(name) : undefined;
      const tint = resolveBlockTint(def, slot);
      const u0 = rect?.u0 ?? 0;
      const v0 = rect?.v0 ?? 0;
      const u1 = rect?.u1 ?? 1;
      const v1 = rect?.v1 ?? 1;
      const base = face * 4;

      // Map texture rectangle corners
      uv.setXY(base, u0, v1);
      uv.setXY(base + 1, u1, v1);
      uv.setXY(base + 2, u0, v0);
      uv.setXY(base + 3, u1, v0);

      for (let vertex = 0; vertex < 4; vertex++) {
        const i = (base + vertex) * 3;
        colors[i] = rect ? tint[0] : 1;
        colors[i + 1] = rect ? tint[1] : 0;
        colors[i + 2] = rect ? tint[2] : 1;
      }
    }

    geometry.rotateX(Math.PI);
    uv.needsUpdate = true;
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    return geometry;
  }

  public static mergeGeometries(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
    const merged = new THREE.BufferGeometry();
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    let vertexOffset = 0;
    for (const g of geoms) {
      const posAttr = g.getAttribute('position') as THREE.BufferAttribute;
      const normAttr = g.getAttribute('normal') as THREE.BufferAttribute;
      const uvAttr = g.getAttribute('uv') as THREE.BufferAttribute;
      const colAttr = g.getAttribute('color') as THREE.BufferAttribute;
      const indexAttr = g.getIndex();

      for (let i = 0; i < posAttr.count; i++) {
        positions.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
        normals.push(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i));
        uvs.push(uvAttr.getX(i), uvAttr.getY(i));
        colors.push(colAttr.getX(i), colAttr.getY(i), colAttr.getZ(i));
      }

      if (indexAttr) {
        for (let i = 0; i < indexAttr.count; i++) {
          indices.push(indexAttr.getX(i) + vertexOffset);
        }
      } else {
        for (let i = 0; i < posAttr.count; i++) {
          indices.push(i + vertexOffset);
        }
      }
      vertexOffset += posAttr.count;
    }

    merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    merged.setIndex(indices);
    return merged;
  }

  /** Separate sprite/cross/other special-shape renderers can use this canonical flat source. */
  public static buildFlatGeometry(def: BlockDefinition, atlas: TextureAtlas): THREE.BufferGeometry {
    const name = resolveBlockTexture(def, 'side');
    const rect = name ? atlas.getUvRect(name) : undefined;
    const tint = resolveBlockTint(def, 'side');
    const g = new THREE.PlaneGeometry(1, 1);
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    uv.setXY(0, rect?.u0 ?? 0, rect?.v1 ?? 1);
    uv.setXY(1, rect?.u1 ?? 1, rect?.v1 ?? 1);
    uv.setXY(2, rect?.u0 ?? 0, rect?.v0 ?? 0);
    uv.setXY(3, rect?.u1 ?? 1, rect?.v0 ?? 0);
    g.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(
        [
          tint[0], tint[1], tint[2],
          tint[0], tint[1], tint[2],
          tint[0], tint[1], tint[2],
          tint[0], tint[1], tint[2],
        ],
        3
      )
    );
    return g;
  }

  public static buildDebugPlaceholder(): THREE.BufferGeometry {
    const g = new THREE.PlaneGeometry(1, 1);
    g.setAttribute('color', new THREE.Float32BufferAttribute([1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1], 3));
    return g;
  }
}
