import * as THREE from 'three';
import type { WorldTime } from '../../world/WorldTime';
import { CelestialRenderer } from './CelestialRenderer';
import {
  SkyColorController,
  type SkyColorState,
  type CloudColor,
} from './SkyColorController';

/**
 * Sky rendering subsystem.
 *
 * Rationale for a sky sphere rather than Beta's literal flat OpenGL planes:
 *   - Same visual result: an infinite-feeling sky whose top/horizon/bottom
 *     colours transition smoothly and whose horizon meets the fog band.
 *   - Zero geometric edge cases: no plane-vs-terrain intersection possible
 *     because the sphere always sits centred on the camera at a large,
 *     fixed radius and is drawn with depthTest/depthWrite disabled.
 *   - No jitter possible: the sphere is a static, immutable geometry.
 *     Only per-frame update is the per-vertex colour attribute, which is
 *     driven by SkyColorState (no reallocations, no matrix churn).
 *
 * Depth setup:
 *   - Sky sphere: depthTest:false, depthWrite:false, fog:false, renderOrder:-100.
 *     Painted first, colour-only. Terrain (renderOrder 0, default depth
 *     writes) then overwrites sky pixels wherever solid geometry sits in
 *     front. Result: no hall-of-mirrors, no z-fighting, terrain silhouettes
 *     cleanly cut into the sky exactly as they should.
 *
 * Camera coupling:
 *   - Position: the root sky group's position is copied from the camera
 *     each frame (translation only). This is what makes the sky "follow"
 *     the player: it stays centred on the eye.
 *   - Rotation: NEVER copied from the camera. The celestial group's own
 *     rotation is driven purely by the world's celestial angle. Looking
 *     around therefore reveals different parts of the same fixed sky,
 *     with the Sun / Moon / stars staying anchored to world orientation
 *     — exactly the Beta behaviour.
 */

const SKY_RADIUS = 300;
const SKY_WIDTH_SEGMENTS = 32;
const SKY_HEIGHT_SEGMENTS = 16;

/**
 * Fractional altitude within the sphere over which the horizon band
 * blends. Small band = crisp horizon line (Beta-like). Larger band =
 * softer.
 */
const HORIZON_BAND_HALF_WIDTH = 0.08;

const scratchTop = new THREE.Color();
const scratchHorizon = new THREE.Color();
const scratchBottom = new THREE.Color();

export interface SkyRenderState {
  readonly celestialAngle: number;
  readonly skyPhase: string;
  readonly starOpacity: number;
  readonly sunAltitude: number;
  readonly skylightSubtracted: number;
  readonly sunBrightnessFactor: number;
  readonly skyColorHex: number;
  readonly horizonColorHex: number;
  readonly fogColorHex: number;
  readonly biomeUsed: 'plains-default' | 'custom';
}

export class SkyRenderer {
  /** Camera-tracking root. Never rotated; only translated. */
  private readonly root: THREE.Group;

  private readonly domeMesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private readonly colorAttribute: THREE.BufferAttribute;

  private readonly celestialRenderer: CelestialRenderer;
  private readonly skyColorController: SkyColorController;

  private lastState: SkyRenderState;
  private mostRecentColorState: SkyColorState;

  public constructor(scene: THREE.Scene) {
    this.root = new THREE.Group();
    this.root.name = 'skyRoot';
    this.root.frustumCulled = false;
    // Render order is used as a group hint for children too; the sphere
    // itself uses -100 so it paints before any celestials (−50/-40) and
    // long before terrain (0).
    this.root.renderOrder = -100;
    scene.add(this.root);

    // --- Sky sphere -----------------------------------------------------
    const geometry = new THREE.SphereGeometry(
      SKY_RADIUS,
      SKY_WIDTH_SEGMENTS,
      SKY_HEIGHT_SEGMENTS,
    );
    const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
    const colours = new Float32Array(positions.count * 3);
    this.colorAttribute = new THREE.BufferAttribute(colours, 3);
    // Set once so `geometry.attributes.color` exists before vertexColors sees it.
    this.colorAttribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('color', this.colorAttribute);

    const material = new THREE.MeshBasicMaterial({
      side: THREE.BackSide,
      vertexColors: true,
      depthTest: false,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });

    this.domeMesh = new THREE.Mesh(geometry, material);
    this.domeMesh.name = 'skyDome';
    this.domeMesh.renderOrder = -100;
    this.domeMesh.frustumCulled = false;
    this.root.add(this.domeMesh);

    // --- Celestials -----------------------------------------------------
    this.celestialRenderer = new CelestialRenderer();
    this.root.add(this.celestialRenderer.group);

    // --- Colour controller ---------------------------------------------
    this.skyColorController = new SkyColorController();

    // Seed lastState with a plausible daytime snapshot.
    this.lastState = {
      celestialAngle: 0,
      skyPhase: 'midday',
      starOpacity: 0,
      sunAltitude: 1,
      skylightSubtracted: 0,
      sunBrightnessFactor: 1,
      skyColorHex: 0x74a5ff,
      horizonColorHex: 0xc0d8ff,
      fogColorHex: 0xc0d8ff,
      biomeUsed: 'plains-default',
    };
    this.mostRecentColorState = this.skyColorController.compute({
      // Cheap fake for the initial call (Engine calls update() before render).
      getCelestialAngle: () => 0,
      getTimeOfDayTicks: () => 6000,
    } as unknown as WorldTime);
    this.applyColorState(this.mostRecentColorState);
  }

  /**
   * Called once per frame by Engine, after camera position has been updated
   * to the player's eye. Returns a SkyRenderState that other subsystems
   * (fog, debug HUD) consume for time-of-day information.
   */
  public update(
    camera: THREE.PerspectiveCamera,
    worldTime: WorldTime,
    weatherFade: { celestialFade: number; sunriseFade: number } = { celestialFade: 1, sunriseFade: 1 },
  ): SkyRenderState {
    // Position-only follow. Never copy rotation.
    this.root.position.copy(camera.position);

    const colourState = this.skyColorController.compute(worldTime);
    this.mostRecentColorState = colourState;
    this.applyColorState(colourState);
    // Stage 18: weather fade modulates celestial + sunrise opacity.
    this.celestialRenderer.update(
      colourState,
      weatherFade.celestialFade,
      weatherFade.sunriseFade,
    );

    this.lastState = {
      celestialAngle: colourState.celestialAngle,
      skyPhase: colourState.skyPhase,
      starOpacity: colourState.starOpacity,
      sunAltitude: colourState.sunAltitude,
      skylightSubtracted: colourState.skylightSubtracted,
      sunBrightnessFactor: colourState.sunBrightnessFactor,
      skyColorHex: colourState.skyColorHex,
      horizonColorHex: colourState.horizonColorHex,
      fogColorHex: colourState.fogColorHex,
      biomeUsed: 'plains-default',
    };
    return this.lastState;
  }

  /** Latest state snapshot (for the F3 overlay). */
  public getCurrentState(): SkyRenderState {
    return this.lastState;
  }

  /** Latest colour state, consumed by FogController for overworld fog colour. */
  public getCurrentColorState(): SkyColorState {
    return this.mostRecentColorState;
  }

  /**
   * Stage 17 cloud colour bridge. Delegates to SkyColorController so
   * clouds, fog, and horizon all share ONE atmospheric colour source.
   * Weather defaults to NO_WEATHER (Stage 17 has no weather system);
   * a future weather implementation can pass through the strength.
   */
  public getCurrentCloudColor(worldTime: WorldTime): CloudColor {
    return this.skyColorController.getCloudColor(worldTime);
  }

  public dispose(): void {
    this.celestialRenderer.dispose();
    this.domeMesh.geometry.dispose();
    this.domeMesh.material.dispose();
    this.domeMesh.removeFromParent();
    this.root.removeFromParent();
  }

  /**
   * Recomputes every sphere vertex's colour from the current SkyColorState.
   * Cost: one linear-interpolation per vertex × 32×16 = ~500 vertices per
   * frame. Trivial, no allocation.
   *
   * Blend rule:
   *   - Above horizon (y > +band):  interpolate from horizon → zenith
   *     using smoothstep on normalised altitude, so the zenith is a
   *     deeper blue and the transition is smooth (no visible band edge).
   *   - Within horizon band:        interpolate horizon color as a soft
   *     band; slightly warm-tinted by the sunrise/sunset colour when
   *     present.
   *   - Below horizon (y < −band): interpolate horizon → bottom similarly.
   */
  private applyColorState(state: SkyColorState): void {
    // ----- Stage 16D fix: sRGB → linear conversion ---------------------
    // Renderer.outputColorSpace is SRGBColorSpace, which means every
    // colour reaching a fragment shader is expected to be in LINEAR
    // space; the framebuffer conversion then applies gamma at output.
    //
    // SkyColorController produces Beta's canonical colours in sRGB
    // display space (e.g. midnight fog ≈ #0B0C16). If we wrote those
    // numbers directly to the vertex colour buffer via Color.setRGB(r,g,b),
    // Three would treat them as linear and the framebuffer→sRGB pass
    // would brighten them dramatically (0.045 linear → ~0.235 sRGB, so
    // the "midnight sky" would display as #3B3F54 blue-grey instead of
    // near-black — which was the actual on-screen bug).
    //
    // Passing SRGBColorSpace as the 4th argument to setRGB() tells Three
    // to convert the input sRGB values to the working linear space
    // before storing them, so the framebuffer pass ends up producing
    // exactly the intended display colour.
    //
    // The sunrise-tint blend below happens AFTER conversion, in linear
    // space, so we convert the sunrise colours the same way before
    // mixing.
    // Stage 17B: `state.horizonR/G/B` now already includes the
    // sunrise/sunset tint mix (moved into SkyColorController). No
    // further re-blending here — the same numbers are packed into
    // `state.horizonColorHex`, so the fog colour consumed by
    // FogController and the vertex colour written into the sky sphere
    // horizon band are guaranteed identical.
    scratchTop.setRGB(state.zenithR, state.zenithG, state.zenithB, THREE.SRGBColorSpace);
    scratchHorizon.setRGB(state.horizonR, state.horizonG, state.horizonB, THREE.SRGBColorSpace);
    scratchBottom.setRGB(state.bottomR, state.bottomG, state.bottomB, THREE.SRGBColorSpace);

    const positions = this.domeMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const count = positions.count;
    const array = this.colorAttribute.array as Float32Array;

    for (let i = 0; i < count; i++) {
      const y = positions.getY(i) / SKY_RADIUS; // normalised [-1..+1]

      let r: number;
      let g: number;
      let b: number;

      if (y >= HORIZON_BAND_HALF_WIDTH) {
        const raw = (y - HORIZON_BAND_HALF_WIDTH) / (1 - HORIZON_BAND_HALF_WIDTH);
        const t = smoothstep01(raw);
        r = scratchHorizon.r + (scratchTop.r - scratchHorizon.r) * t;
        g = scratchHorizon.g + (scratchTop.g - scratchHorizon.g) * t;
        b = scratchHorizon.b + (scratchTop.b - scratchHorizon.b) * t;
      } else if (y <= -HORIZON_BAND_HALF_WIDTH) {
        const raw = (-y - HORIZON_BAND_HALF_WIDTH) / (1 - HORIZON_BAND_HALF_WIDTH);
        const t = smoothstep01(raw);
        r = scratchHorizon.r + (scratchBottom.r - scratchHorizon.r) * t;
        g = scratchHorizon.g + (scratchBottom.g - scratchHorizon.g) * t;
        b = scratchHorizon.b + (scratchBottom.b - scratchHorizon.b) * t;
      } else {
        r = scratchHorizon.r;
        g = scratchHorizon.g;
        b = scratchHorizon.b;
      }

      array[i * 3] = r;
      array[i * 3 + 1] = g;
      array[i * 3 + 2] = b;
    }

    this.colorAttribute.needsUpdate = true;
  }
}

function smoothstep01(x: number): number {
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  return t * t * (3 - 2 * t);
}
