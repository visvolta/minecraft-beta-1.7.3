import * as THREE from 'three';

const STAR_COUNT = 1500;
const STAR_RADIUS = 440;
const STAR_MIN_SIZE = 1.5;
const STAR_MAX_SIZE = 4.25;
const STAR_MIN_BRIGHTNESS = 0.55;
const STAR_MAX_BRIGHTNESS = 1.0;
const STAR_SEED = 0x5f3759df;

const baseForward = new THREE.Vector3(0, 0, 1);
const tempPosition = new THREE.Vector3();
const tempDirection = new THREE.Vector3();
const tempAxis = new THREE.Vector3();
const tempQuaternion = new THREE.Quaternion();
const tempRoll = new THREE.Quaternion();
const tempColor = new THREE.Color();
const dummy = new THREE.Object3D();

function nextRandom(state: { value: number }): number {
  state.value = (1664525 * state.value + 1013904223) >>> 0;
  return state.value / 0x100000000;
}

export class StarField {
  public readonly mesh: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

  public constructor() {
    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    this.mesh = new THREE.InstancedMesh(geometry, material, STAR_COUNT);
    this.mesh.name = 'starField';
    this.mesh.renderOrder = -950;
    this.mesh.frustumCulled = false;

    const state = { value: STAR_SEED };
    for (let i = 0; i < STAR_COUNT; i++) {
      this.populateStar(i, state);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
  }

  public setBrightness(brightness: number): void {
    this.mesh.material.opacity = brightness;
    this.mesh.visible = brightness > 0.001;
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.removeFromParent();
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
      tempAxis.copy(tempDirection).multiplyScalar(-1);
      tempQuaternion.setFromUnitVectors(baseForward, tempAxis.normalize());
      tempRoll.setFromAxisAngle(tempAxis, nextRandom(state) * Math.PI * 2);
      tempQuaternion.multiply(tempRoll);

      const size = THREE.MathUtils.lerp(STAR_MIN_SIZE, STAR_MAX_SIZE, nextRandom(state));
      const brightness = THREE.MathUtils.lerp(STAR_MIN_BRIGHTNESS, STAR_MAX_BRIGHTNESS, nextRandom(state));

      dummy.position.copy(tempPosition);
      dummy.quaternion.copy(tempQuaternion);
      dummy.scale.set(size, size, 1);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(index, dummy.matrix);

      tempColor.setScalar(brightness);
      this.mesh.setColorAt(index, tempColor);
      return;
    }
  }
}
