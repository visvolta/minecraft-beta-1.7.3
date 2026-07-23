import * as THREE from 'three';
import type { PrecipitationRenderer } from './PrecipitationRenderer';
import type { AtmosphericState } from '../AtmosphericState';

/**
 * Beta-style rain-impact splash particles.
 *
 * Beta spawns `EntityRainFX` when a random column in the visible
 * precipitation area receives rain (never snow). Each particle is a
 * tiny billboarded blue quad with a short lifetime.
 *
 * Stage 18B: BOTH supplied splash textures are used. We keep the
 * total pool at `MAX_SPLASH_PARTICLES` and split it evenly across two
 * `InstancedMesh` instances, one per texture. On spawn, a 50/50
 * random pick decides which mesh (and therefore which texture) will
 * carry that splash for its whole lifetime. Result: any given frame
 * shows a mix of both textures, exactly as required.
 *
 * Camera-facing billboard is done via an `onBeforeRender` hook that
 * copies the camera basis into an instance attribute — no per-particle
 * matrices, no allocations per frame.
 *
 * Audio hook: `onSplashSpawn(x, y, z)` callback prop. Stage 18 has no
 * audio; a future audio system implements this.
 */

/** Total splash particle capacity (Stage 18 q6). */
export const MAX_SPLASH_PARTICLES = 96;

/** How many spawn attempts per second at full rain strength (Beta ~1000/s scaled down). */
const SPAWN_ATTEMPTS_PER_SECOND = 220;

/** Splash particle lifetime in seconds. */
const SPLASH_LIFETIME_SECONDS = 0.4;

/** Splash particle world size. Beta splashes are ~0.1 blocks tall. */
const SPLASH_SIZE = 0.16;

/** Vertical rise during lifetime (blocks). Beta splashes rise slightly. */
const SPLASH_RISE = 0.05;

/** Two supplied splash asset paths. */
const SPLASH_TEXTURE_PATHS = [
  '/textures/environment/rain_splash.png',
  '/textures/environment/rain_splash2.png',
] as const;

/** Optional audio-hook signature — future rain-ambient system implements this. */
export type SplashAudioHook = (x: number, y: number, z: number) => void;

interface Particle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  age: number;
}

/** One instanced-mesh + particle pool per splash texture. */
interface SplashLayer {
  mesh: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  particles: Particle[];
}

export class RainSplashRenderer {
  private readonly layers: SplashLayer[];
  private readonly matrixScratch = new THREE.Matrix4();
  private readonly cameraRightScratch = new THREE.Vector3();
  private readonly cameraUpScratch = new THREE.Vector3();
  private readonly rotationScratch = new THREE.Matrix4();
  private readonly scaleScratch = new THREE.Vector3();
  private readonly translationScratch = new THREE.Vector3();
  private readonly forwardScratch = new THREE.Vector3();
  private readonly quaternionScratch = new THREE.Quaternion();
  private spawnBudget = 0;
  private audioHook: SplashAudioHook | null = null;

  public constructor(scene: THREE.Scene) {
    const loader = new THREE.TextureLoader();
    const perLayerCap = Math.max(1, Math.floor(MAX_SPLASH_PARTICLES / SPLASH_TEXTURE_PATHS.length));
    this.layers = SPLASH_TEXTURE_PATHS.map((path, layerIndex) => {
      const texture = loader.load(path, configureCrispTexture);
      configureCrispTexture(texture);
      const geometry = new THREE.PlaneGeometry(1, 1);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 1,
        alphaTest: 0.5,
        depthTest: true,
        depthWrite: false,
        fog: false,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
        toneMapped: false,
      });
      const mesh = new THREE.InstancedMesh(geometry, material, perLayerCap);
      mesh.name = `rainSplashes_${layerIndex}`;
      mesh.renderOrder = 25;
      mesh.frustumCulled = false;
      mesh.count = 0;
      scene.add(mesh);
      const particles: Particle[] = [];
      for (let i = 0; i < perLayerCap; i++) {
        particles.push({ active: false, x: 0, y: 0, z: 0, age: 0 });
      }
      return { mesh, particles };
    });
  }

  public setAudioHook(hook: SplashAudioHook | null): void {
    this.audioHook = hook;
  }

  public update(
    camera: THREE.PerspectiveCamera,
    deltaSeconds: number,
    atmos: AtmosphericState,
    precipitation: PrecipitationRenderer,
  ): void {
    // Age active particles.
    for (const layer of this.layers) {
      for (const p of layer.particles) {
        if (!p.active) continue;
        p.age += deltaSeconds;
        if (p.age >= SPLASH_LIFETIME_SECONDS) {
          p.active = false;
        }
      }
    }

    // Attempt to spawn new splashes when it's raining.
    if (atmos.rainStrength > 0.001) {
      this.spawnBudget += SPAWN_ATTEMPTS_PER_SECOND * atmos.rainStrength * deltaSeconds;
      const rainingCols = precipitation.getRainingColumns();
      if (rainingCols.length > 0) {
        while (this.spawnBudget >= 1) {
          this.spawnBudget -= 1;
          const col = rainingCols[Math.floor(Math.random() * rainingCols.length)]!;
          this.trySpawn(col.worldX + Math.random(), col.topY, col.worldZ + Math.random());
        }
      } else {
        this.spawnBudget = 0;
      }
    } else {
      this.spawnBudget = 0;
    }

    // Rebuild per-frame billboard matrices for each layer.
    camera.matrixWorld.extractBasis(
      this.cameraRightScratch,
      this.cameraUpScratch,
      this.forwardScratch,
    );
    // The third basis vector (forward) is the camera's -Z in view space;
    // we want the mesh to face +Z toward the camera, so use it as-is
    // for the third column of the basis matrix.
    for (const layer of this.layers) {
      let writeIndex = 0;
      for (const p of layer.particles) {
        if (!p.active) continue;
        const ageT = p.age / SPLASH_LIFETIME_SECONDS;
        const y = p.y + ageT * SPLASH_RISE;
        const scale = SPLASH_SIZE * (1 - ageT * 0.3);
        this.translationScratch.set(p.x, y, p.z);
        this.scaleScratch.set(scale, scale, scale);
        this.rotationScratch.makeBasis(
          this.cameraRightScratch,
          this.cameraUpScratch,
          this.forwardScratch,
        );
        this.quaternionScratch.setFromRotationMatrix(this.rotationScratch);
        this.matrixScratch.compose(
          this.translationScratch,
          this.quaternionScratch,
          this.scaleScratch,
        );
        layer.mesh.setMatrixAt(writeIndex, this.matrixScratch);
        writeIndex += 1;
      }
      layer.mesh.count = writeIndex;
      layer.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  public dispose(): void {
    for (const layer of this.layers) {
      layer.mesh.geometry.dispose();
      layer.mesh.material.map?.dispose();
      layer.mesh.material.dispose();
      layer.mesh.removeFromParent();
    }
  }

  /** Sum of active particles across every texture layer. */
  public getActiveCount(): number {
    let n = 0;
    for (const layer of this.layers) n += layer.mesh.count;
    return n;
  }

  private trySpawn(x: number, topY: number, z: number): void {
    // Stage 18B: pick a splash texture layer 50/50 at spawn time.
    // Each splash keeps its texture for the full lifetime.
    const layerIndex = Math.random() < 0.5 ? 0 : 1;
    const preferred = this.layers[layerIndex]!;
    // If the preferred layer is full this frame, try the other one so
    // the particle isn't lost when only one pool is saturated.
    const search = [preferred, this.layers[1 - layerIndex]!];
    for (const layer of search) {
      for (const p of layer.particles) {
        if (p.active) continue;
        p.active = true;
        p.x = x;
        p.y = topY + 0.01;
        p.z = z;
        p.age = 0;
        this.audioHook?.(x, topY, z);
        return;
      }
    }
    // Pool exhausted this frame across BOTH layers; skip. Not fatal.
  }
}

function configureCrispTexture(texture: THREE.Texture): void {
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  if (hasTextureImageData(texture)) texture.needsUpdate = true;
}

function hasTextureImageData(texture: THREE.Texture): boolean {
  const image = texture.image as { width?: unknown; height?: unknown; data?: unknown } | undefined;
  return image != null && (
    (typeof image.width === 'number' && image.width > 0 && typeof image.height === 'number' && image.height > 0)
    || image.data !== undefined
  );
}
