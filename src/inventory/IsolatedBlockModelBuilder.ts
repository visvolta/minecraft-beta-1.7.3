import * as THREE from 'three';
import type { BlockDefinition } from '../blocks/BlockDefinition';
import type { TextureAtlas } from '../assets/TextureAtlas';
import { resolveBlockTexture, getSemanticFace } from '../blocks/resolveBlockTexture';
import { resolveBlockTint } from '../blocks/resolveBlockTint';
import { BlockIds } from '../blocks/BlockId';
import { FaceDirection } from '../blocks/BlockFace';

/** Fresh isolated standard cube: BoxGeometry owns exact shared vertices, winding and normals. */
export class IsolatedBlockModelBuilder {
  static build(def: BlockDefinition, atlas: TextureAtlas): THREE.BufferGeometry {
    // Runtime guard verifying only genuine standard cube blocks reach IsolatedBlockModelBuilder
    if (
      def.renderType === 'cross' ||
      def.renderType === 'cactus' ||
      def.renderType === 'snow' ||
      def.id === BlockIds.Torch ||
      def.id === BlockIds.RedstoneTorch ||
      def.id === BlockIds.Ladder ||
      def.id === BlockIds.WoodDoor ||
      def.id === BlockIds.SignPost ||
      def.id === BlockIds.WallSign ||
      def.id === BlockIds.StoneButton ||
      def.id === BlockIds.Lever ||
      def.id === BlockIds.StonePressurePlate ||
      def.id === 66 || // Rail
      def.id === 27 || // PoweredRail
      def.id === 28 || // DetectorRail
      (!def.solid && def.renderType !== 'ice')
    ) {
      console.warn(`[IsolatedBlockModelBuilder] Non-cube definition rejected by cube model builder: ${def.name}`);
      return new THREE.BufferGeometry();
    }

    const g = new THREE.BoxGeometry(1, 1, 1);
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    const col = new Float32Array(72);
    const faces: Array<FaceDirection> = [FaceDirection.EAST, FaceDirection.WEST, FaceDirection.TOP, FaceDirection.BOTTOM, FaceDirection.SOUTH, FaceDirection.NORTH];

    faces.forEach((dir, f) => {
      const slot = getSemanticFace(dir, 3);
      const name = resolveBlockTexture(def, slot);
      const r = name ? atlas.getUvRect(name) : undefined;
      const t = resolveBlockTint(def, slot);
      const b = f * 4;
      for (const [n, x, y] of [[0, r?.u0 ?? 0, r?.v1 ?? 1], [1, r?.u1 ?? 1, r?.v1 ?? 1], [2, r?.u0 ?? 0, r?.v0 ?? 0], [3, r?.u1 ?? 1, r?.v0 ?? 0]] as const) {
        uv.setXY(b + n, x, y);
        const i = (b + n) * 3;
        col[i] = r ? t[0] : 1;
        col[i + 1] = r ? t[1] : 0;
        col[i + 2] = r ? t[2] : 1;
      }
    });

    g.rotateX(Math.PI);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }
}
