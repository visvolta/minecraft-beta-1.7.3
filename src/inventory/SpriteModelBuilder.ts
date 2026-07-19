import * as THREE from 'three';

/** Single authoritative double-sided thin sprite geometry builder with explicit front and unmirrored back faces. */
export class SpriteModelBuilder {
  static build(u0: number, v0: number, u1: number, v1: number, flipHorizontal = false): THREE.BufferGeometry {
    const h = 0.5;
    const z = 0.001;
    const g = new THREE.BufferGeometry();

    const effU0 = flipHorizontal ? u1 : u0;
    const effU1 = flipHorizontal ? u0 : u1;

    g.setAttribute('position', new THREE.Float32BufferAttribute([
      -h,  h,  z,   h,  h,  z,  -h, -h,  z,   h, -h,  z, // Front quad
      -h,  h, -z,   h,  h, -z,  -h, -h, -z,   h, -h, -z  // Back quad
    ], 3));

    g.setAttribute('uv', new THREE.Float32BufferAttribute([
      effU0, v0,  effU1, v0,  effU0, v1,  effU1, v1,
      effU1, v0,  effU0, v0,  effU1, v1,  effU0, v1
    ], 2));

    g.setIndex([
      0, 2, 1,   1, 2, 3,
      5, 7, 4,   4, 7, 6
    ]);

    g.computeVertexNormals();
    return g;
  }
}
