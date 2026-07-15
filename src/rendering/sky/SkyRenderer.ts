import * as THREE from 'three';
import type { WorldTime } from '../../world/WorldTime';
import { CelestialRenderer } from './CelestialRenderer';
import { SkyColorController, type SkyColorState } from './SkyColorController';

const SKY_DOME_RADIUS = 470;
const SKY_DOME_WIDTH_SEGMENTS = 32;
const SKY_DOME_HEIGHT_SEGMENTS = 16;

const topColor = new THREE.Color();
const horizonColor = new THREE.Color();
const bottomColor = new THREE.Color();

function hexToColor(target: THREE.Color, hex: number): void {
  target.setHex(hex);
}

export interface SkyState {
  readonly fogColorHex: number;
  readonly skyColorHex: number;
  readonly celestialAngle: number;
  readonly skyPhase: string;
  readonly starOpacity: number;
  readonly sunAltitude: number;
  readonly skylightSubtracted: number;
}

export class SkyRenderer {
  private readonly root = new THREE.Group();
  private readonly skyColorController = new SkyColorController();
  private readonly celestialRenderer = new CelestialRenderer();
  private readonly skyDome: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private readonly skyColorAttribute: THREE.BufferAttribute;
  private currentState: SkyState = {
    fogColorHex: 0x70a0ff,
    skyColorHex: 0x70a0ff,
    celestialAngle: 0,
    skyPhase: 'day',
    starOpacity: 0,
    sunAltitude: 1,
    skylightSubtracted: 0,
  };

  public constructor(scene: THREE.Scene) {
    this.root.name = 'skyRenderer';
    this.root.renderOrder = -1000;
    this.root.frustumCulled = false;
    scene.add(this.root);

    const geometry = new THREE.SphereGeometry(
      SKY_DOME_RADIUS,
      SKY_DOME_WIDTH_SEGMENTS,
      SKY_DOME_HEIGHT_SEGMENTS,
    );
    const colors = new Float32Array((geometry.getAttribute('position').count) * 3);
    this.skyColorAttribute = new THREE.BufferAttribute(colors, 3);
    geometry.setAttribute('color', this.skyColorAttribute);

    const material = new THREE.MeshBasicMaterial({
      side: THREE.BackSide,
      vertexColors: true,
      fog: false,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });

    this.skyDome = new THREE.Mesh(geometry, material);
    this.skyDome.name = 'skyDome';
    this.skyDome.renderOrder = -1000;
    this.skyDome.frustumCulled = false;
    this.root.add(this.skyDome);
    this.root.add(this.celestialRenderer.group);
  }

  public update(camera: THREE.PerspectiveCamera, worldTime: WorldTime): SkyState {
    const colorState = this.skyColorController.compute(worldTime);
    this.root.position.copy(camera.position);
    this.updateSkyGradient(colorState);
    const celestial = this.celestialRenderer.update(camera, colorState);

    this.currentState = {
      fogColorHex: colorState.fogColorHex,
      skyColorHex: colorState.skyHorizonColorHex,
      celestialAngle: colorState.celestialAngle,
      skyPhase: colorState.skyPhase,
      starOpacity: celestial.starOpacity,
      sunAltitude: celestial.sunAltitude,
      skylightSubtracted: colorState.skylightSubtracted,
    };

    return this.currentState;
  }

  public getCurrentState(): SkyState {
    return this.currentState;
  }

  public dispose(): void {
    this.celestialRenderer.dispose();
    this.skyDome.geometry.dispose();
    this.skyDome.material.dispose();
    this.skyDome.removeFromParent();
    this.root.removeFromParent();
  }

  private updateSkyGradient(state: SkyColorState): void {
    hexToColor(topColor, state.skyTopColorHex);
    hexToColor(horizonColor, state.skyHorizonColorHex);
    hexToColor(bottomColor, state.skyBottomColorHex);

    const positions = this.skyDome.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < positions.count; i++) {
      const y = positions.getY(i) / SKY_DOME_RADIUS;

      let r: number;
      let g: number;
      let b: number;

      if (y >= 0) {
        const t = THREE.MathUtils.clamp(y, 0, 1);
        r = THREE.MathUtils.lerp(horizonColor.r, topColor.r, t);
        g = THREE.MathUtils.lerp(horizonColor.g, topColor.g, t);
        b = THREE.MathUtils.lerp(horizonColor.b, topColor.b, t);
      } else {
        const t = THREE.MathUtils.clamp(-y, 0, 1);
        r = THREE.MathUtils.lerp(horizonColor.r, bottomColor.r, t);
        g = THREE.MathUtils.lerp(horizonColor.g, bottomColor.g, t);
        b = THREE.MathUtils.lerp(horizonColor.b, bottomColor.b, t);
      }

      this.skyColorAttribute.setXYZ(i, r, g, b);
    }

    this.skyColorAttribute.needsUpdate = true;
  }
}
