import * as THREE from 'three';
import type { SkyColorState } from './SkyColorController';
import { StarField } from './StarField';

const CELESTIAL_RADIUS = 380;
const SUN_SIZE = 180;
const MOON_SIZE = 150;
const SUN_TEXTURE_PATH = '/textures/sky/sun.png';
const MOON_TEXTURE_PATH = '/textures/sky/moon.png';
const SUNRISE_DISC_RADIUS = 320;
const SUNRISE_DISC_DISTANCE = 260;

const forward = new THREE.Vector3(0, 0, 1);
const up = new THREE.Vector3(0, 1, 0);
const down = new THREE.Vector3(0, -1, 0);
const sunLocal = new THREE.Vector3(0, CELESTIAL_RADIUS, 0);
const moonLocal = new THREE.Vector3(0, -CELESTIAL_RADIUS, 0);
const sunriseLocal = new THREE.Vector3(0, 0, SUNRISE_DISC_DISTANCE);
const tempVector = new THREE.Vector3();
const sunriseColor = new THREE.Color();

function configureSharpTexture(texture: THREE.Texture): void {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
}

function buildRadialDiscTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (context === null) {
    throw new Error('Failed to create sunrise disc texture context.');
  }

  const gradient = context.createRadialGradient(128, 128, 10, 128, 128, 128);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.85)');
  gradient.addColorStop(0.7, 'rgba(255,255,255,0.25)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);

  const texture = new THREE.CanvasTexture(canvas);
  configureSharpTexture(texture);
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
    this.group.frustumCulled = false;

    this.celestialGroup.name = 'skyCelestialFrame';
    this.group.add(this.celestialGroup);

    this.starField = new StarField();
    this.celestialGroup.add(this.starField.group);

    const textureLoader = new THREE.TextureLoader();

    const sunTexture = textureLoader.load(SUN_TEXTURE_PATH);
    configureSharpTexture(sunTexture);
    const sunMaterial = new THREE.MeshBasicMaterial({
      map: sunTexture,
      fog: false,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      toneMapped: false,
      alphaTest: 0.5,
      transparent: false,
    });
    this.sunMesh = new THREE.Mesh(new THREE.PlaneGeometry(SUN_SIZE, SUN_SIZE), sunMaterial);
    this.sunMesh.name = 'sun';
    this.sunMesh.position.copy(sunLocal);
    this.sunMesh.quaternion.setFromUnitVectors(forward, down);
    this.sunMesh.renderOrder = -940;
    this.sunMesh.frustumCulled = false;
    this.celestialGroup.add(this.sunMesh);

    const moonTexture = textureLoader.load(MOON_TEXTURE_PATH);
    configureSharpTexture(moonTexture);
    const moonMaterial = new THREE.MeshBasicMaterial({
      map: moonTexture,
      fog: false,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      toneMapped: false,
      alphaTest: 0.5,
      transparent: false,
    });
    this.moonMesh = new THREE.Mesh(new THREE.PlaneGeometry(MOON_SIZE, MOON_SIZE), moonMaterial);
    this.moonMesh.name = 'moon';
    this.moonMesh.position.copy(moonLocal);
    this.moonMesh.quaternion.setFromUnitVectors(forward, up);
    this.moonMesh.renderOrder = -939;
    this.moonMesh.frustumCulled = false;
    this.celestialGroup.add(this.moonMesh);

    const sunriseMaterial = new THREE.MeshBasicMaterial({
      map: buildRadialDiscTexture(),
      transparent: true,
      opacity: 0,
      fog: false,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      toneMapped: false,
      blending: THREE.NormalBlending,
    });
    this.sunriseMesh = new THREE.Mesh(new THREE.CircleGeometry(SUNRISE_DISC_RADIUS, 64), sunriseMaterial);
    this.sunriseMesh.name = 'sunriseDisc';
    this.sunriseMesh.position.copy(sunriseLocal);
    this.sunriseMesh.quaternion.setFromUnitVectors(forward, new THREE.Vector3(0, 0, -1));
    this.sunriseMesh.visible = false;
    this.sunriseMesh.renderOrder = -945;
    this.sunriseMesh.frustumCulled = false;
    this.celestialGroup.add(this.sunriseMesh);

    this.celestialGroup.frustumCulled = false;
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
      this.sunriseMesh.material.opacity = state.sunriseSunset.a;
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
    this.sunMesh.material.map?.dispose();
    this.sunMesh.material.dispose();
    this.sunMesh.removeFromParent();
    this.moonMesh.geometry.dispose();
    this.moonMesh.material.map?.dispose();
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
