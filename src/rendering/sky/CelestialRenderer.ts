import * as THREE from 'three';
import type { SkyColorState } from './SkyColorController';
import { StarField } from './StarField';

const CELESTIAL_RADIUS = 430;
const SUN_SIZE = 120;
const MOON_SIZE = 96;
const SUN_TEXTURE_PATH = '/textures/sky/sun.png';
const MOON_TEXTURE_PATH = '/textures/sky/moon.png';
const SUNRISE_DISC_RADIUS = 220;
const SUNRISE_DISC_DISTANCE = 300;

const forward = new THREE.Vector3(0, 0, 1);
const up = new THREE.Vector3(0, 1, 0);
const down = new THREE.Vector3(0, -1, 0);
const sunLocal = new THREE.Vector3(0, CELESTIAL_RADIUS, 0);
const moonLocal = new THREE.Vector3(0, -CELESTIAL_RADIUS, 0);
const sunriseLocal = new THREE.Vector3(0, 0, SUNRISE_DISC_DISTANCE);
const tempVector = new THREE.Vector3();
const sunriseColor = new THREE.Color();

function buildRadialDiscTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (context === null) {
    throw new Error('Failed to create sunrise disc texture context.');
  }

  const gradient = context.createRadialGradient(128, 128, 8, 128, 128, 128);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export interface CelestialState {
  readonly starOpacity: number;
  readonly sunAltitude: number;
}

export class CelestialRenderer {
  public readonly group = new THREE.Group();

  private readonly celestialGroup = new THREE.Group();
  private readonly starField: StarField;
  private readonly sunMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly moonMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly sunriseMesh: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;

  public constructor() {
    this.group.name = 'skyCelestialsRoot';
    this.group.renderOrder = -980;

    this.celestialGroup.name = 'skyCelestialFrame';
    this.group.add(this.celestialGroup);

    this.starField = new StarField();
    this.celestialGroup.add(this.starField.mesh);

    const textureLoader = new THREE.TextureLoader();

    const sunMaterial = new THREE.MeshBasicMaterial({
      map: textureLoader.load(SUN_TEXTURE_PATH),
      transparent: true,
      fog: false,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    sunMaterial.map!.colorSpace = THREE.SRGBColorSpace;
    this.sunMesh = new THREE.Mesh(new THREE.PlaneGeometry(SUN_SIZE, SUN_SIZE), sunMaterial);
    this.sunMesh.name = 'sun';
    this.sunMesh.position.copy(sunLocal);
    this.sunMesh.quaternion.setFromUnitVectors(forward, down);
    this.sunMesh.renderOrder = -940;
    this.celestialGroup.add(this.sunMesh);

    const moonMaterial = new THREE.MeshBasicMaterial({
      map: textureLoader.load(MOON_TEXTURE_PATH),
      transparent: true,
      fog: false,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    moonMaterial.map!.colorSpace = THREE.SRGBColorSpace;
    this.moonMesh = new THREE.Mesh(new THREE.PlaneGeometry(MOON_SIZE, MOON_SIZE), moonMaterial);
    this.moonMesh.name = 'moon';
    this.moonMesh.position.copy(moonLocal);
    this.moonMesh.quaternion.setFromUnitVectors(forward, up);
    this.moonMesh.renderOrder = -939;
    this.celestialGroup.add(this.moonMesh);

    const sunriseMaterial = new THREE.MeshBasicMaterial({
      map: buildRadialDiscTexture(),
      transparent: true,
      opacity: 0,
      fog: false,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.sunriseMesh = new THREE.Mesh(new THREE.CircleGeometry(SUNRISE_DISC_RADIUS, 48), sunriseMaterial);
    this.sunriseMesh.name = 'sunriseDisc';
    this.sunriseMesh.position.copy(sunriseLocal);
    this.sunriseMesh.quaternion.setFromUnitVectors(forward, new THREE.Vector3(0, 0, -1));
    this.sunriseMesh.visible = false;
    this.sunriseMesh.renderOrder = -945;
    this.celestialGroup.add(this.sunriseMesh);

    this.group.frustumCulled = false;
    this.celestialGroup.frustumCulled = false;
    this.sunMesh.frustumCulled = false;
    this.moonMesh.frustumCulled = false;
    this.sunriseMesh.frustumCulled = false;
  }

  public update(camera: THREE.PerspectiveCamera, state: SkyColorState): CelestialState {
    this.group.position.copy(camera.position);
    this.celestialGroup.rotation.set(state.celestialAngle * Math.PI * 2, 0, 0);

    this.starField.setBrightness(state.starOpacity);

    if (state.sunriseSunset !== null) {
      this.sunriseMesh.visible = true;
      sunriseColor.setRGB(
        state.sunriseSunset.r,
        state.sunriseSunset.g,
        state.sunriseSunset.b,
        THREE.SRGBColorSpace,
      );
      this.sunriseMesh.material.color.copy(sunriseColor);
      this.sunriseMesh.material.opacity = state.sunriseSunset.a * 0.9;
    } else {
      this.sunriseMesh.visible = false;
      this.sunriseMesh.material.opacity = 0;
    }

    tempVector.copy(sunLocal).applyEuler(this.celestialGroup.rotation).normalize();

    return {
      starOpacity: state.starOpacity,
      sunAltitude: tempVector.y,
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
    this.sunriseMesh.material.map?.dispose();
    this.sunriseMesh.material.dispose();
    this.sunriseMesh.removeFromParent();
    this.celestialGroup.removeFromParent();
    this.group.removeFromParent();
  }
}
