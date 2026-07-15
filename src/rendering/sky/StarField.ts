import * as THREE from 'three';

const STAR_COUNT = 1500;
const STAR_RADIUS = 445;
const STAR_MIN_SIZE = 2.5;
const STAR_MAX_SIZE = 6.5;
const STAR_MIN_BRIGHTNESS = 0.7;
const STAR_MAX_BRIGHTNESS = 1.0;
const STAR_GLOW_SCALE = 2.25;
const STAR_SEED = 0x5f3759df;

const baseForward = new THREE.Vector3(0, 0, 1);
const tempPosition = new THREE.Vector3();
const tempDirection = new THREE.Vector3();
const tempQuaternion = new THREE.Quaternion();
const tempRoll = new THREE.Quaternion();
const inwardNormal = new THREE.Vector3();
const tempColor = new THREE.Color();
const dummy = new THREE.Object3D();

function nextRandom(state: { value: number }): number {
  state.value = (1664525 * state.value + 1013904223) >>> 0;
  return state.value / 0x100000000;
}

export class StarField {
  public readonly group = new THREE.Group();

  private readonly coreMesh: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly glowMesh: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

  public constructor() {
    this.group.name = 'starField';
    this.group.renderOrder = -950;
    this.group.frustumCulled = false;

    const geometry = new THREE.PlaneGeometry(1, 1);

    const coreMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: true,
      fog: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      alphaTest: 0.15,
    });

    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: true,
      fog: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
    });

    this.coreMesh = new THREE.InstancedMesh(geometry, coreMaterial, STAR_COUNT);
    this.coreMesh.name = 'starFieldCore';
    this.coreMesh.renderOrder = -950;
    this.coreMesh.frustumCulled = false;

    this.glowMesh = new THREE.InstancedMesh(geometry.clone(), glowMaterial, STAR_COUNT);
    this.glowMesh.name = 'starFieldGlow';
    this.glowMesh.renderOrder = -949;
    this.glowMesh.frustumCulled = false;

    this.group.add(this.coreMesh);
    this.group.add(this.glowMesh);

    const state = { value: STAR_SEED };
    for (let i = 0; i < STAR_COUNT; i++) {
      this.populateStar(i, state);
    }

    this.coreMesh.instanceMatrix.needsUpdate = true;
    this.glowMesh.instanceMatrix.needsUpdate = true;
    this.coreMesh.instanceColor!.needsUpdate = true;
    this.glowMesh.instanceColor!.needsUpdate = true;
  }

  public setBrightness(brightness: number): void {
    this.coreMesh.material.opacity = brightness;
    this.glowMesh.material.opacity = brightness * 0.35;
    const visible = brightness > 0.001;
    this.group.visible = visible;
  }

  public dispose(): void {
    this.coreMesh.geometry.dispose();
    this.coreMesh.material.dispose();
    this.coreMesh.removeFromParent();
    this.glowMesh.geometry.dispose();
    this.glowMesh.material.dispose();
    this.glowMesh.removeFromParent();
    this.group.removeFromParent();
  }

  private populateStar(index: number, state: { value: number }): void {
    while (true) {
      const x = nextRandom(state) * 2 - 1;
      const y = nextRandom(state) * 2 - 1;
      const z = nextRandom(state) * 2 - 1;
      const lengthSq = x * x + y * y + z * z;

      if (lengthSq < 0.01 || lengthSq > 1) {
        continue;
      }

      tempDirection.set(x, y, z).normalize();
      tempPosition.copy(tempDirection).multiplyScalar(STAR_RADIUS);
      inwardNormal.copy(tempDirection).multiplyScalar(-1).normalize();
      tempQuaternion.setFromUnitVectors(baseForward, inwardNormal);
      tempRoll.setFromAxisAngle(inwardNormal, nextRandom(state) * Math.PI * 2);
      tempQuaternion.multiply(tempRoll);

      const size = THREE.MathUtils.lerp(STAR_MIN_SIZE, STAR_MAX_SIZE, nextRandom(state));
      const brightness = THREE.MathUtils.lerp(STAR_MIN_BRIGHTNESS, STAR_MAX_BRIGHTNESS, nextRandom(state));

      dummy.position.copy(tempPosition);
      dummy.quaternion.copy(tempQuaternion);
      dummy.scale.set(size, size, 1);
      dummy.updateMatrix();
      this.coreMesh.setMatrixAt(index, dummy.matrix);

      dummy.scale.set(size * STAR_GLOW_SCALE, size * STAR_GLOW_SCALE, 1);
      dummy.updateMatrix();
      this.glowMesh.setMatrixAt(index, dummy.matrix);

      tempColor.setScalar(brightness);
      this.coreMesh.setColorAt(index, tempColor);
      this.glowMesh.setColorAt(index, tempColor);
      return;
    }
  }
}
