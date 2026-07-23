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
    const topUv = this.atlas.getUvRect('singlechest_top') || { u0: 0, v0: 0, u1: 1, v1: 1 };
    const bottomUv = this.atlas.getUvRect('singlechest_top') || { u0: 0, v0: 0, u1: 1, v1: 1 };
    const sideUv = this.atlas.getUvRect('singlechest_side') || { u0: 0, v0: 0, u1: 1, v1: 1 };
    const frontUv = this.atlas.getUvRect('singlechest_front') || { u0: 0, v0: 0, u1: 1, v1: 1 };

    const baseGeo = new THREE.BoxGeometry(1, 10/16, 1);
    const lidGeo = new THREE.BoxGeometry(1, 6/16, 1);

    // Apply UVs to Base
    this.mapBoxUVs(baseGeo, topUv, bottomUv, sideUv, frontUv, 6/16, 1);
    
    // Apply UVs to Lid
    this.mapBoxUVs(lidGeo, topUv, bottomUv, sideUv, frontUv, 0, 6/16);

    lidGeo.translate(0, 3/16, 0.5);

    const addColors = (g: THREE.BoxGeometry) => {
      const col = new Float32Array(g.attributes.position!.count * 3);
      col.fill(1);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      
      const ones = new Float32Array(g.attributes.position!.count);
      ones.fill(1);
      const fifteens = new Float32Array(g.attributes.position!.count);
      fifteens.fill(15);
      const zeros = new Float32Array(g.attributes.position!.count);
      zeros.fill(0);
      
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

    // We explicitly map uMin, uMax, vMin, vMax to the exact vertices of each face
    // For standard THREE.BoxGeometry:
    // Face 0: +X (Right)
    // Face 1: -X (Left)
    // Face 2: +Y (Top)
    // Face 3: -Y (Bottom)
    // Face 4: +Z (Front)
    // Face 5: -Z (Back)

    const setExplicitUv = (
      faceIdx: number, 
      rect: AtlasUvRect, 
      v1: number, 
      v2: number,
      v0Map: number, v1Map: number, v2Map: number, v3Map: number
    ) => {
      const u0 = rect.u0;
      const v0_tex = rect.v0;
      const u1 = rect.u1;
      const v1_tex = rect.v1;

      const vRange = v1_tex - v0_tex;
      const faceV0 = v0_tex + v1 * vRange; // Top of the slice
      const faceV1 = v0_tex + v2 * vRange; // Bottom of the slice

      const idx = faceIdx * 4;

      // Determine which vertex gets which UV corner based on explicit map
      const assign = (vertIndex: number, corner: number) => {
        let u = u0, v = faceV0;
        if (corner === 0) { u = u0; v = faceV0; } // Top-Left
        else if (corner === 1) { u = u1; v = faceV0; } // Top-Right
        else if (corner === 2) { u = u0; v = faceV1; } // Bottom-Left
        else if (corner === 3) { u = u1; v = faceV1; } // Bottom-Right
        uvAttr.setXY(idx + vertIndex, u, v);
      };

      assign(0, v0Map);
      assign(1, v1Map);
      assign(2, v2Map);
      assign(3, v3Map);
    };

    // For side faces (0, 1, 4, 5): 
    // v0: Top-Left (0), v1: Top-Right (1), v2: Bottom-Left (2), v3: Bottom-Right (3)
    const sides = [0, 1, 4, 5];
    for (const f of sides) {
      const rect = f === 4 ? frontUv : sideUv;
      setExplicitUv(f, rect, vStart, vEnd, 0, 1, 2, 3);
    }

    // Top face (+Y, Face 2):
    // v0: Top-Left (0), v1: Top-Right (1), v2: Bottom-Left (2), v3: Bottom-Right (3)
    setExplicitUv(2, topUv, 0, 1, 0, 1, 2, 3);

    // Bottom face (-Y, Face 3):
    // v0: Bottom-Left (2)
    // v1: Bottom-Right (3)
    // v2: Top-Left (0)
    // v3: Top-Right (1)
    setExplicitUv(3, bottomUv, 0, 1, 2, 3, 0, 1);
  }

  public dispose(): void {
    this.scene.remove(this.group);
    if (this.baseMesh) this.baseMesh.dispose();
    if (this.lidMesh) this.lidMesh.dispose();
    this.baseGeometry?.dispose();
    this.lidGeometry?.dispose();
    this.chestMap.clear();
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

    const count = Math.max(1, this.chestManager.getContainers().length + 50);
    
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

      // Facing rotations
      let rotY = 0;
      if (c.facing === 2) rotY = Math.PI;
      else if (c.facing === 4) rotY = Math.PI / 2;
      else if (c.facing === 5) rotY = -Math.PI / 2;

      this.dummyObj.position.set(c.x + 0.5, c.y + 5/16, c.z + 0.5);
      this.dummyObj.rotation.set(0, rotY, 0);
      this.dummyObj.updateMatrix();
      this.baseMesh.setMatrixAt(i, this.dummyObj.matrix);

      const angle = THREE.MathUtils.lerp(c.prevLidAngle, c.lidAngle, 1.0);
      const rotX = angle * 1.0; 

      this.dummyObj.position.set(c.x + 0.5, c.y + 10/16, c.z + 0.5);
      this.dummyObj.rotation.set(0, rotY, 0);
      
      this.dummyObj.translateZ(-0.5);
      this.dummyObj.rotateX(-rotX);
      
      this.dummyObj.updateMatrix();
      this.lidMesh.setMatrixAt(i, this.dummyObj.matrix);
    }

    this.baseMesh.instanceMatrix.needsUpdate = true;
    this.lidMesh.instanceMatrix.needsUpdate = true;
  }
}
