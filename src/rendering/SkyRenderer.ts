import * as THREE from 'three';
import type { SunriseSunsetColors, WorldTime } from '../world/WorldTime';
import { StarField } from './StarField';

const CELESTIAL_RADIUS = 420;
const SUN_SIZE = 60;
const MOON_SIZE = 48;
const SUN_TEXTURE_PATH = '/textures/sky/sun.png';
const MOON_TEXTURE_PATH = '/textures/sky/moon.png';
const SUNRISE_PLANE_WIDTH = 320;
const SUNRISE_PLANE_HEIGHT = 160;

function rgbToHex(color: { r: number; g: number; b: number }): number {
  const r = THREE.MathUtils.clamp(Math.round(color.r * 255), 0, 255);
  const g = THREE.MathUtils.clamp(Math.round(color.g * 255), 0, 255);
  const b = THREE.MathUtils.clamp(Math.round(color.b * 255), 0, 255);
  return (r << 16) | (g << 8) | b;
}

export interface SkyState {
  readonly backgroundColorHex: number;
  readonly starBrightness: number;
  readonly celestialAngle: number;
  readonly skyPhase: string;
}

export class SkyRenderer {
  private readonly skyGroup = new THREE.Group();
  private readonly starField: StarField;
  private readonly sunMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly moonMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly sunriseMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

  public constructor(scene: THREE.Scene) {
    this.skyGroup.name = 'skyRenderer';
    this.skyGroup.renderOrder = -1000;
    scene.add(this.skyGroup);

    this.starField = new StarField();
    this.skyGroup.add(this.starField.points);

    const textureLoader = new THREE.TextureLoader();

    const sunMaterial = new THREE.MeshBasicMaterial({
      map: textureLoader.load(SUN_TEXTURE_PATH),
      transparent: true,
      fog: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    sunMaterial.map!.colorSpace = THREE.SRGBColorSpace;
    this.sunMesh = new THREE.Mesh(new THREE.PlaneGeometry(SUN_SIZE, SUN_SIZE), sunMaterial);
    this.sunMesh.name = 'sun';
    this.sunMesh.renderOrder = -940;
    this.skyGroup.add(this.sunMesh);

    const moonMaterial = new THREE.MeshBasicMaterial({
      map: textureLoader.load(MOON_TEXTURE_PATH),
      transparent: true,
      fog: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    moonMaterial.map!.colorSpace = THREE.SRGBColorSpace;
    this.moonMesh = new THREE.Mesh(new THREE.PlaneGeometry(MOON_SIZE, MOON_SIZE), moonMaterial);
    this.moonMesh.name = 'moon';
    this.moonMesh.renderOrder = -939;
    this.skyGroup.add(this.moonMesh);

    const sunriseMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      fog: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.sunriseMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(SUNRISE_PLANE_WIDTH, SUNRISE_PLANE_HEIGHT),
      sunriseMaterial,
    );
    this.sunriseMesh.name = 'sunriseBand';
    this.sunriseMesh.visible = false;
    this.sunriseMesh.renderOrder = -945;
    this.skyGroup.add(this.sunriseMesh);
  }

  public update(camera: THREE.PerspectiveCamera, worldTime: WorldTime): SkyState {
    const celestialAngle = worldTime.getCelestialAngle();
    const theta = celestialAngle * Math.PI * 2;
    const sunDirection = new THREE.Vector3(0, Math.cos(theta), Math.sin(theta));
    const moonDirection = sunDirection.clone().multiplyScalar(-1);

    this.skyGroup.position.copy(camera.position);

    this.sunMesh.position.copy(sunDirection).multiplyScalar(CELESTIAL_RADIUS);
    this.sunMesh.quaternion.copy(camera.quaternion);

    this.moonMesh.position.copy(moonDirection).multiplyScalar(CELESTIAL_RADIUS);
    this.moonMesh.quaternion.copy(camera.quaternion);

    const sunriseColors = worldTime.calcSunriseSunsetColors();
    this.updateSunriseBand(camera, sunDirection, moonDirection, sunriseColors);

    const starBrightness = worldTime.getStarBrightness();
    this.starField.setBrightness(starBrightness);

    return {
      backgroundColorHex: rgbToHex(worldTime.getFogColor()),
      starBrightness,
      celestialAngle,
      skyPhase: worldTime.getSkyPhase(),
    };
  }

  public dispose(): void {
    this.starField.dispose();
    this.sunMesh.geometry.dispose();
    this.sunMesh.material.dispose();
    this.sunMesh.removeFromParent();
    this.moonMesh.geometry.dispose();
    this.moonMesh.material.dispose();
    this.moonMesh.removeFromParent();
    this.sunriseMesh.geometry.dispose();
    this.sunriseMesh.material.dispose();
    this.sunriseMesh.removeFromParent();
    this.skyGroup.removeFromParent();
  }

  private updateSunriseBand(
    camera: THREE.PerspectiveCamera,
    sunDirection: THREE.Vector3,
    moonDirection: THREE.Vector3,
    sunriseColors: SunriseSunsetColors | null,
  ): void {
    if (sunriseColors === null) {
      this.sunriseMesh.visible = false;
      return;
    }

    const horizonDirection = sunDirection.y >= 0 ? sunDirection : moonDirection;
    const horizon = new THREE.Vector3(0, 0, horizonDirection.z >= 0 ? 1 : -1);

    this.sunriseMesh.visible = true;
    this.sunriseMesh.position.copy(horizon).multiplyScalar(CELESTIAL_RADIUS * 0.75);
    this.sunriseMesh.quaternion.copy(camera.quaternion);
    this.sunriseMesh.material.color.setRGB(sunriseColors.r, sunriseColors.g, sunriseColors.b, THREE.SRGBColorSpace);
    this.sunriseMesh.material.opacity = sunriseColors.a * 0.8;
  }
}
