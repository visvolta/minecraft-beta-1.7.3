import * as THREE from 'three';

/**
 * Double-sided thin sprite geometry for flat items (swords, tools, food,
 * icons).
 *
 * Beta reference: `ItemRenderer.renderItem`'s 2D path builds the front quad at
 * `z = 0` and the back quad at `z = -0.0625`, and — critically — assigns the
 * **same u to the same world-space x on both faces**:
 *
 *   front: (x=0, u=uMin) (x=w, u=uMax)
 *   back:  (x=0, u=uMin) (x=w, u=uMax)
 *
 * That means the back face reads as a mirror image when viewed from behind,
 * which is the correct real-world behaviour of a flat cut-out: a sword seen
 * from the far side points the other way, exactly like a physical blade.
 *
 * The previous implementation swapped u on the back quad. That cancelled the
 * natural mirror and made the blade point the *same* screen direction from
 * both sides, which read as a reversed/incorrect backside on swords and tools.
 */
export class SpriteModelBuilder {
  static build(u0: number, v0: number, u1: number, v1: number, flipHorizontal = false): THREE.BufferGeometry {
    const h = 0.5;
    const z = 0.001;
    const g = new THREE.BufferGeometry();

    // `flipHorizontal` mirrors the whole sprite (both faces together), used by
    // axes whose icon is authored facing the other way. It must not be applied
    // per-face, or the two faces disagree.
    const effU0 = flipHorizontal ? u1 : u0;
    const effU1 = flipHorizontal ? u0 : u1;

    g.setAttribute('position', new THREE.Float32BufferAttribute([
      -h,  h,  z,   h,  h,  z,  -h, -h,  z,   h, -h,  z, // Front quad
      -h,  h, -z,   h,  h, -z,  -h, -h, -z,   h, -h, -z, // Back quad
    ], 3));

    // Same u for the same x on both quads (Beta parity). Vertices 0/2 and 4/6
    // share x = -h, vertices 1/3 and 5/7 share x = +h.
    g.setAttribute('uv', new THREE.Float32BufferAttribute([
      effU0, v0,  effU1, v0,  effU0, v1,  effU1, v1,
      effU0, v0,  effU1, v0,  effU0, v1,  effU1, v1,
    ], 2));

    g.setIndex([
      0, 2, 1,   1, 2, 3,
      5, 7, 4,   4, 7, 6,
    ]);

    g.computeVertexNormals();
    return g;
  }
}
