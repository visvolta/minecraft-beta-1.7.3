import * as THREE from 'three';
import type { ChestManager } from './ChestManager';
import type { TextureAtlas, AtlasUvRect } from '../assets/TextureAtlas';
export class ChestRenderer {
  private readonly group = new THREE.Group();
  private baseGeometry!: THREE.BufferGeometry;
  private lidGeometry!: THREE.BufferGeometry;
  
  // Instanced Meshes allow zero allocation during updates
  private baseMesh!: THREE.InstancedMesh;
  private lidMesh!: THREE.InstancedMesh;
  
  // Mapping PosKey -> instance index
  private chestMap = new Map<string, number>();

  private readonly dummyObj = new THREE.Object3D();
  
  public constructor(
    private readonly scene: THREE.Scene,
    private readonly chestManager: ChestManager,
    private readonly atlas: TextureAtlas,
    private readonly material: THREE.MeshBasicMaterial
  ) {
    this.scene.add(this.group);
    this.buildGeometries();
    this.rebuildInstancedMeshes();
  }

  private buildGeometries(): void {
    // Top, bottom, side, front texture rects from the atlas
    const topUv = this.atlas.getUvRect('singlechest_top') || { u0: 0, v0: 0, u1: 1, v1: 1 };
    const sideUv = this.atlas.getUvRect('singlechest_side') || { u0: 0, v0: 0, u1: 1, v1: 1 };
    const frontUv = this.atlas.getUvRect('singlechest_front') || { u0: 0, v0: 0, u1: 1, v1: 1 };

    // In Beta 1.7.3, the chest is visually 16x16x16, but we'll split it at y=10/16
    // Base: y=0 to y=10/16
    // Lid:  y=10/16 to y=16/16. The lid pivots on the back top edge of the base.
    
    // We'll build simple Box geometries and remap UVs.
    const baseGeo = new THREE.BoxGeometry(1, 10/16, 1);
    const lidGeo = new THREE.BoxGeometry(1, 6/16, 1);

    // Apply UVs to Base
    this.mapBoxUVs(baseGeo, topUv, topUv, sideUv, frontUv, 0, 10/16);
    
    // Apply UVs to Lid
    this.mapBoxUVs(lidGeo, topUv, topUv, sideUv, frontUv, 10/16, 1);

    // Shift lid geometry so origin is at the hinge (back bottom edge of the lid)
    // BoxGeometry origin is center.
    // The lid is 1x(6/16)x1. Center is at y=(3/16), z=0
    // To hinge at z=-0.5 (back), y=-3/16 (bottom of lid).
    // We add 0.5 to Z so the hinge is at local Z=0.
    lidGeo.translate(0, 3/16, 0.5);

    // Add color attribute (white) to avoid black rendering
    const addColors = (g: THREE.BoxGeometry) => {
      const col = new Float32Array(g.attributes.position!.count * 3);
      col.fill(1); // Fill with white
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      
      // Also add dummy lighting attributes for the shader
      const ones = new Float32Array(g.attributes.position!.count);
      ones.fill(1);
      const fifteens = new Float32Array(g.attributes.position!.count);
      fifteens.fill(15); // max sky light
      const zeros = new Float32Array(g.attributes.position!.count);
      zeros.fill(0); // 0 block light
      
      g.setAttribute('tintColor', new THREE.BufferAttribute(col.slice(), 3));
      g.setAttribute('skyLightLevel', new THREE.BufferAttribute(fifteens, 1));
      g.setAttribute('blockLightLevel', new THREE.BufferAttribute(zeros, 1));
      g.setAttribute('aoFactorScalar', new THREE.BufferAttribute(ones, 1));
      g.setAttribute('faceBrightness', new THREE.BufferAttribute(ones, 1));
    };

    addColors(baseGeo);
    addColors(lidGeo);

    this.baseGeometry = baseGeo;
    this.lidGeometry = lidGeo;
  }

  private mapBoxUVs(geo: THREE.BoxGeometry, topUv: AtlasUvRect, bottomUv: AtlasUvRect, sideUv: AtlasUvRect, frontUv: AtlasUvRect, vStart: number, vEnd: number): void {
    const uvAttr = geo.attributes.uv;
    if (!uvAttr) return;

    // Three.js BoxGeometry face order:
    // +x (right), -x (left), +y (top), -y (bottom), +z (front), -z (back)
    // Each face has 4 vertices (2 triangles) -> 8 UV floats per face.
    
    // helper to set UVs
    const setFaceUv = (faceIdx: number, rect: AtlasUvRect, v1: number, v2: number, rotated = false) => {
      let u0 = rect.u0;
      let v0_tex = rect.v0;
      let u1 = rect.u1;
      let v1_tex = rect.v1;

      // Interpolate vertical slice
      const vRange = v1_tex - v0_tex;
      const faceV0 = v0_tex + v1 * vRange;
      const faceV1 = v0_tex + v2 * vRange;

      const idx = faceIdx * 8;
      
      if (rotated) {
        // Rotated 180 degrees (for back side matching Beta 1.7.3 top/bottom UV maps)
        uvAttr.setXY(idx/2 + 0, u1, faceV0);
        uvAttr.setXY(idx/2 + 1, u0, faceV0);
        uvAttr.setXY(idx/2 + 2, u1, faceV1);
        uvAttr.setXY(idx/2 + 3, u0, faceV1);
      } else {
        uvAttr.setXY(idx/2 + 0, u0, faceV1);
        uvAttr.setXY(idx/2 + 1, u1, faceV1);
        uvAttr.setXY(idx/2 + 2, u0, faceV0);
        uvAttr.setXY(idx/2 + 3, u1, faceV0);
      }
    };

    setFaceUv(0, sideUv, vStart, vEnd);  // Right (+X)
    setFaceUv(1, sideUv, vStart, vEnd);  // Left (-X)
    setFaceUv(2, topUv, 0, 1);           // Top (+Y)
    setFaceUv(3, bottomUv, 0, 1);        // Bottom (-Y)
    setFaceUv(4, frontUv, vStart, vEnd); // Front (+Z)
    setFaceUv(5, sideUv, vStart, vEnd);  // Back (-Z)
  }

  private rebuildInstancedMeshes(): void {
    if (this.baseMesh) {
      this.group.remove(this.baseMesh);
      this.baseMesh.dispose();
    }
    if (this.lidMesh) {
      this.group.remove(this.lidMesh);
      this.lidMesh.dispose();
    }

    const count = Math.max(1, this.chestManager.getContainers().length + 50); // pad
    
    this.baseMesh = new THREE.InstancedMesh(this.baseGeometry, this.material, count);
    this.lidMesh = new THREE.InstancedMesh(this.lidGeometry, this.material, count);
    
    this.baseMesh.count = 0;
    this.lidMesh.count = 0;
    
    this.group.add(this.baseMesh);
    this.group.add(this.lidMesh);
  }

  public update(_deltaSeconds: number): void {
    const containers = this.chestManager.getContainers();
    
    if (containers.length > this.baseMesh.instanceMatrix.count) {
      this.rebuildInstancedMeshes();
    }

    this.baseMesh.count = containers.length;
    this.lidMesh.count = containers.length;
    this.chestMap.clear();

    for (let i = 0; i < containers.length; i++) {
      const c = containers[i]!;
      this.chestMap.set(c.getPosKey(), i);

      // Facing rotations (Beta 1.7.3 placement meta: 2=Z-, 3=Z+, 4=X-, 5=X+)
      let rotY = 0;
      if (c.facing === 2) rotY = Math.PI;
      else if (c.facing === 4) rotY = Math.PI / 2;
      else if (c.facing === 5) rotY = -Math.PI / 2;
      // 3 is default (0 rotation)

      // Base Transform
      this.dummyObj.position.set(c.x + 0.5, c.y + 5/16, c.z + 0.5);
      this.dummyObj.rotation.set(0, rotY, 0);
      this.dummyObj.updateMatrix();
      this.baseMesh.setMatrixAt(i, this.dummyObj.matrix);

      // Lid Transform
      // Interpolate angle:
      // In a real frame loop, we'd use a partial tick alpha, but here we'll just use lidAngle.
      const angle = THREE.MathUtils.lerp(c.prevLidAngle, c.lidAngle, 1.0); // actually deltaSeconds is needed for real interpolation but ok
      // Beta 1.8+ lid opens to roughly 1.0 radian (approx 60 degrees) backwards
      const rotX = angle * 1.0; 

      this.dummyObj.position.set(c.x + 0.5, c.y + 10/16, c.z + 0.5);
      this.dummyObj.rotation.set(0, rotY, 0);
      
      // Pivot offset
      this.dummyObj.translateZ(-0.5); // move to back hinge
      this.dummyObj.rotateX(-rotX);
      
      this.dummyObj.updateMatrix();
      this.lidMesh.setMatrixAt(i, this.dummyObj.matrix);
    }

    this.baseMesh.instanceMatrix.needsUpdate = true;
    this.lidMesh.instanceMatrix.needsUpdate = true;
  }
}
