import * as THREE from 'three';

const STAR_COUNT = 1500;
const STAR_RADIUS = 450;
const STAR_SIZE = 1.5;
const STAR_SEED = 0x5f3759df;

function nextRandom(state: { value: number }): number {
  state.value = (1664525 * state.value + 1013904223) >>> 0;
  return state.value / 0x100000000;
}

export class StarField {
  public readonly points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;

  public constructor() {
    const positions = new Float32Array(STAR_COUNT * 3);
    const state = { value: STAR_SEED };

    let written = 0;
    while (written < STAR_COUNT) {
      const x = nextRandom(state) * 2 - 1;
      const y = nextRandom(state) * 2 - 1;
      const z = nextRandom(state) * 2 - 1;
      const lengthSq = x * x + y * y + z * z;

      if (lengthSq < 0.01 || lengthSq > 1) {
        continue;
      }

      const invLength = STAR_RADIUS / Math.sqrt(lengthSq);
      positions[written * 3] = x * invLength;
      positions[written * 3 + 1] = y * invLength;
      positions[written * 3 + 2] = z * invLength;
      written += 1;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: STAR_SIZE,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });

    this.points = new THREE.Points(geometry, material);
    this.points.name = 'starField';
    this.points.renderOrder = -950;
  }

  public setBrightness(brightness: number): void {
    this.points.material.opacity = brightness;
    this.points.visible = brightness > 0.001;
  }

  public dispose(): void {
    this.points.geometry.dispose();
    this.points.material.dispose();
    this.points.removeFromParent();
  }
}
