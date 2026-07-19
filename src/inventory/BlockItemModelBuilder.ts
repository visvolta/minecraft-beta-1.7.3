import * as THREE from 'three';
import type { BlockDefinition } from '../blocks/BlockDefinition';
import type { TextureAtlas } from '../assets/TextureAtlas';
import { resolveBlockTexture } from '../blocks/resolveBlockTexture';
import { resolveBlockTint } from '../blocks/resolveBlockTint';

// Authentic verified Beta 1.7.3 HUD face shading coefficients
const FACE_SHADING: Record<number, number> = {
  0: 0.6,  // +X (Right)
  1: 0.6,  // -X (Left)
  2: 1.0,  // +Y (Top)
  3: 0.5,  // -Y (Bottom)
  4: 0.8,  // +Z (Back)
  5: 0.8,  // -Z (Front)
};

export class BlockItemModelBuilder {
  /**
   * Generates a custom THREE.BufferGeometry for 3D block items.
   * Dynamically constructs Stair, Slab, Cactus, and Snow layer shapes,
   * applying correct face textures, foliage tints, and isometric shading.
   */
  public static build3DGeometry(
    def: BlockDefinition,
    atlas: TextureAtlas,
  ): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();

    const positionsList: number[] = [];
    const uvsList: number[] = [];
    const colorsList: number[] = [];
    const indicesList: number[] = [];
    let vertexCount = 0;

    const addBox = (
      minX: number, minY: number, minZ: number,
      maxX: number, maxY: number, maxZ: number
    ) => {
      const faces = [
        { slot: 'side',   f: 0, corners: [[maxX, minY, minZ], [maxX, maxY, minZ], [maxX, maxY, maxZ], [maxX, minY, maxZ]] }, // +X (Right)
        { slot: 'side',   f: 1, corners: [[minX, minY, maxZ], [minX, maxY, maxZ], [minX, maxY, minZ], [minX, minY, minZ]] }, // -X (Left)
        { slot: 'top',    f: 2, corners: [[minX, maxY, maxZ], [maxX, maxY, maxZ], [maxX, maxY, minZ], [minX, maxY, minZ]] }, // +Y (Top)
        { slot: 'bottom', f: 3, corners: [[minX, minY, minZ], [maxX, minY, minZ], [maxX, minY, maxZ], [minX, minY, maxZ]] }, // -Y (Bottom)
        { slot: 'side',   f: 4, corners: [[minX, minY, maxZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], [minX, maxY, maxZ]] }, // +Z (Back)
        { slot: 'side',   f: 5, corners: [[minX, maxY, minZ], [maxX, maxY, minZ], [maxX, minY, minZ], [minX, minY, minZ]] }, // -Z (Front)
      ] as const;

      for (const { slot, f, corners } of faces) {
        const texName = resolveBlockTexture(def, slot);
        let uvRect = texName !== undefined ? atlas.getUvRect(texName) : undefined;
        const tint = resolveBlockTint(def, slot);

        // Asset safety check
        if (texName !== undefined && uvRect === undefined) {
          console.warn(
            `[BlockItemModelBuilder] Missing atlas texture: "${texName}" for block: "${def.name}". Using magenta placeholder.`
          );
        }

        // Fallback to magenta debug if missing
        const u0 = uvRect ? uvRect.u0 : 0;
        const v0 = uvRect ? uvRect.v0 : 0;
        const u1 = uvRect ? uvRect.u1 : 1;
        const v1 = uvRect ? uvRect.v1 : 1;

        // Push 4 positions
        for (let v = 0; v < 4; v++) {
          const c = corners[v]!;
          positionsList.push(c[0], c[1], c[2]);
        }

        // Push 4 UV coordinates
        uvsList.push(u0, v0,  u1, v0,  u0, v1,  u1, v1);

        // Push 4 colors (foliage/grass tint multiplied by authentic isometric shading)
        const shading = FACE_SHADING[f] ?? 1.0;
        const isMissing = texName !== undefined && uvRect === undefined;
        const r = isMissing ? 1.0 : tint[0] * shading;
        const g = isMissing ? 0.0 : tint[1] * shading;
        const b = isMissing ? 1.0 : tint[2] * shading;

        for (let v = 0; v < 4; v++) {
          colorsList.push(r, g, b);
        }

        // Push 6 indices
        indicesList.push(
          vertexCount + 0, vertexCount + 2, vertexCount + 1,
          vertexCount + 1, vertexCount + 2, vertexCount + 3
        );

        vertexCount += 4;
      }
    };

    // Strict metadata-driven geometry builders (no collision approximations)
    if (def.renderType === 'cactus') {
      addBox(0.0625, 0, 0.0625, 0.9375, 1, 0.9375);
    } else if (def.renderType === 'snow') {
      addBox(0, 0, 0, 1, 0.125, 1);
    } else if (def.name.includes('slab')) {
      addBox(0, 0, 0, 1, 0.5, 1);
    } else if (def.name.includes('stairs')) {
      // Replicate authentic Beta 1.7.3 Stairs model (bottom half + top back-half)
      addBox(0, 0, 0, 1, 0.5, 1);       // Bottom half-box
      addBox(0, 0.5, 0.5, 1, 1, 1.0);   // Top back-half box
    } else if (def.name.includes('fence')) {
      // Replicate authentic Beta 1.7.3 Fence inventory model (posts + double rails)
      addBox(0.375, 0, 0, 0.625, 1.0, 0.25);   // Front post
      addBox(0.375, 0, 0.75, 0.625, 1.0, 1.0);  // Back post
      addBox(0.4375, 0.8125, 0.25, 0.5625, 0.9375, 0.75); // Top rail
      addBox(0.4375, 0.3125, 0.25, 0.5625, 0.4375, 0.75); // Bottom rail
    } else {
      // Standard opaque, leaves, glass, ores
      addBox(0, 0, 0, 1, 1, 1);
    }

    geometry.setIndex(indicesList);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positionsList, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvsList, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colorsList, 3));
    geometry.computeVertexNormals();

    return geometry;
  }

  /**
   * Generates a flat 2D plane quad BufferGeometry for flat block-derived sprites, 
   * retrieving the block's main texture and applying vertex-tinting dynamically.
   */
  public static buildFlatGeometry(
    def: BlockDefinition,
    atlas: TextureAtlas,
  ): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();

    const texName = resolveBlockTexture(def, 'side') || 'stone';
    const uvRect = atlas.getUvRect(texName);
    const tint = resolveBlockTint(def, 'side');

    if (uvRect === undefined) {
      console.warn(
        `[BlockItemModelBuilder] Missing atlas texture: "${texName}" for flat block: "${def.name}". Using magenta placeholder.`
      );
    }

    const u0 = uvRect ? uvRect.u0 : 0;
    const v0 = uvRect ? uvRect.v0 : 0;
    const u1 = uvRect ? uvRect.u1 : 1;
    const v1 = uvRect ? uvRect.v1 : 1;

    const half = 0.5;
    const positions = new Float32Array([
      -half,  half, 0, // Top-Left
       half,  half, 0, // Top-Right
      -half, -half, 0, // Bottom-Left
       half, -half, 0, // Bottom-Right
    ]);

    const uvs = new Float32Array([
      u0, v0,
      u1, v0,
      u0, v1,
      u1, v1,
    ]);

    const colors = new Float32Array(12);
    const isMissing = uvRect === undefined;
    const r = isMissing ? 1.0 : tint[0];
    const g = isMissing ? 0.0 : tint[1];
    const b = isMissing ? 1.0 : tint[2];

    for (let i = 0; i < 4; i++) {
      colors[i * 3 + 0] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }

    const indices = [
      0, 2, 1,
      1, 2, 3
    ];

    geometry.setIndex(indices);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    return geometry;
  }

  /**
   * Generates a bright magenta debug placeholder quad geometry.
   */
  public static buildDebugPlaceholder(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const half = 0.5;
    const positions = new Float32Array([
      -half,  half, 0,
       half,  half, 0,
      -half, -half, 0,
       half, -half, 0,
    ]);
    const uvs = new Float32Array([
      0, 0,
      1, 0,
      0, 1,
      1, 1,
    ]);
    const colors = new Float32Array([
      1.0, 0.0, 1.0,
      1.0, 0.0, 1.0,
      1.0, 0.0, 1.0,
      1.0, 0.0, 1.0,
    ]);
    geometry.setIndex([0, 2, 1, 1, 2, 3]);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    return geometry;
  }
}
