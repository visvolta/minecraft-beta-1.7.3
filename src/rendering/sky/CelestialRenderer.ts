import * as THREE from 'three';
import { StarField } from './StarField';
import type { SkyColorState } from './SkyColorController';

/**
 * Sun / Moon / Stars / sunrise-disc.
 *
 * Scene hierarchy (Stage 16D correction)
 * --------------------------------------
 * The outer `group` is what SkyRenderer positions to the camera each
 * frame — translation only, never rotation. Two children:
 *
 *   group (translation-only follow of the camera)
 *   ├── celestialGroup (rotation.x = celestialAngle * 2π, per frame)
 *   │      ├── sunMesh          — rotates with the sun
 *   │      ├── moonMesh         — rotates opposite the sun
 *   │      └── sunriseMesh      — rotates with the sun (horizon halo)
 *   └── starField.mesh          — WORLD-FIXED, opacity is the only per-
 *                                 frame update; stars never spin.
 *
 * Prior to Stage 16D, the star mesh was inside `celestialGroup` and
 * therefore rotated with the sun — that produced the "stars orbit the
 * sky" bug. The brief explicitly requires stars to remain fixed on the
 * celestial sphere and only fade with getStarBrightness, so the star
 * mesh is now attached to the outer `group` directly.
 *
 * Angular-size targeting
 * ----------------------
 * Beta 1.7.3 renders the Sun as a 60-unit quad at Y=+100 and the Moon as
 * a 40-unit quad at Y=−100 (angular diameters ≈33.4° / 22.6°). We derive
 * plane size from `(radius, degrees)` so the visible size is exact.
 *
 * Depth / blend setup (Stage 16E correction)
 * ------------------------------------------
 * The supplied sun.png and moon.png are palettised PNGs with tRNS soft
 * alpha (Sun ~38 discrete alpha levels 1..40; Moon ~32 alpha levels
 * 2..154). They are NOT binary alpha masks — the halo pixels carry real
 * partial-transparency information intended to blend against the sky.
 *
 * Stage 16D used `transparent: false + alphaTest: 0.1 + NormalBlending`
 * as an opaque cutout, which discarded the entire soft halo (leaving a
 * jagged bright disc) and produced the "opaque rectangle / hard edge"
 * bug the brief flags.
 *
 * A premultiplied-alpha cutout (`alphaTest: 0.01` + RGB pre-scaled by
 * alpha) was evaluated and rejected: for typical daytime sky backgrounds
 * (Beta plains sky ≈ #78AFFF, noon fog ≈ #C0D8FF, sunrise horizon warm)
 * the premultiplied edge pixels display ~250/255 darker than an ideal
 * alpha blend — producing a visible dark halo around Sun/Moon during the
 * day. Audit at scripts/verifySkyStage16.ts's `sun.png alpha audit` block.
 *
 * The Stage 16E fix keeps true alpha using Three.js's own transparent
 * queue:
 *
 *   • transparent: true           — enters the TRANSPARENT queue, drawn
 *                                    AFTER opaque terrain in the same
 *                                    render(). By then the depth buffer
 *                                    already contains terrain depths.
 *   • depthTest:  true            — occlusion via the shared depth
 *                                    buffer. Mountains / cave ceilings
 *                                    correctly cull celestial fragments.
 *   • depthWrite: false           — celestials never occlude terrain,
 *                                    water, or each other's blends.
 *   • blending:  NormalBlending   — standard `src.a * src + (1-src.a) *
 *                                    dst`, so partial-alpha halo texels
 *                                    blend against whatever sky colour
 *                                    is behind them, cleanly at any
 *                                    time of day.
 *   • alphaTest: 0                — no cutoff; halo texels blend.
 *   • renderOrder: -1             — sort ahead of water (renderOrder 0)
 *                                    inside the transparent queue, so
 *                                    water surfaces still paint over the
 *                                    sun where they overlap.
 *   • fog: false                  — celestials sit on the sky sphere,
 *                                    not in the terrain-distance fog.
 *   • toneMapped: false           — texture colours reach the
 *                                    framebuffer unchanged.
 *
 * This is a "dedicated celestial render pass" in the behavioural sense
 * the brief requires (true alpha; terrain-occluded) without physically
 * adding a second Three.js render() call — the transparent queue's
 * ordering already provides exactly that separation.
 *
 * The sunrise disc uses the same setup with a smaller plane and damped
 * alpha (see SUNRISE_ALPHA_DAMPING) so it remains a restrained warm
 * halo instead of a giant bloom.
 *
 * Star geometry keeps AdditiveBlending — stars against a dim sky need
 * luminance contribution, and additive is what Beta's own renderStars
 * uses (`glBlendFunc(GL_SRC_ALPHA, GL_ONE)`). See StarField.ts.
 */

/**
 * Celestial-sphere radius in world blocks (Stage 18 correction).
 *
 * Stage 17 kept this at Beta's literal 100 blocks. That put Sun/Moon
 * IN FRONT of any cloud fragment more than ~90 blocks horizontal from
 * the camera — Sun would visually overpaint distant clouds even though
 * clouds are supposed to obscure Sun.
 *
 * Stage 18 bumps to 480 (well past the ~291 max cloud-fragment
 * distance for our 48×48 grid, safely inside CAMERA_FAR = 512).
 * Angular diameters are preserved because `planeSideForAngularDiameter`
 * scales the plane linearly with radius — the on-screen size of Sun
 * and Moon does not change.
 *
 * With this radius, the depth of a Sun fragment is farther than any
 * cloud fragment, so an opaque depth-writing cloud fragment correctly
 * fails the transparent Sun fragment's depth-test on subsequent draws
 * — clouds obscure Sun/Moon exactly where the sky-space paths cross.
 * No material-type change on the Sun/Moon is required; they stay in
 * the transparent queue with soft PNG alpha intact.
 */
const CELESTIAL_RADIUS = 480;

/** Beta angular diameters. Change these to make celestials larger/smaller. */
export const SUN_ANGULAR_DEGREES = 33.4;
export const MOON_ANGULAR_DEGREES = 22.6;

/**
 * Sunrise/sunset radial disc size. Beta uses a 120-unit triangle fan
 * concentrated at the horizon. Stage 16D reduces this from 120 (Stage 16
 * had 240 = radius*2) to 70 (so the total disc plane is 140 units wide),
 * because the sky-sphere horizon tint already carries the visible
 * sunrise colour and a large additive disc produced excessive bloom.
 */
/**
 * Sunrise disc radius. Sized so at the current CELESTIAL_RADIUS the
 * on-screen angular size stays roughly the same as when Stage 17
 * chose 70 units at CELESTIAL_RADIUS=100. Since angular size scales
 * with `plane / distance`, we multiply the plane by (CELESTIAL_RADIUS/100).
 */
const SUNRISE_DISC_RADIUS = 70 * (CELESTIAL_RADIUS / 100);
const SUNRISE_DISC_TEXTURE_SIZE = 256;

/**
 * Damping applied to Beta's own sunriseSunset alpha. Beta's α peaks near
 * 0.98 in the middle of the band; combined with a large plane and (in
 * Stage 16) additive blending, this filled the sky. With NormalBlending
 * we keep it a touch below Beta so the disc reads as a warm halo rather
 * than a saturated orange patch.
 */
const SUNRISE_ALPHA_DAMPING = 0.8;

/** Render order used for every celestial mesh (Stage 16D fix). */
const CELESTIAL_RENDER_ORDER = -1;

/** File paths for the supplied celestial textures. */
const SUN_TEXTURE_PATH = '/textures/sky/sun.png';
const MOON_TEXTURE_PATH = '/textures/sky/moon.png';

/** Reused scratch objects (no per-frame allocations). */
const tempColor = new THREE.Color();
const worldUp = new THREE.Vector3(0, 1, 0);
const worldDown = new THREE.Vector3(0, -1, 0);
const worldForwardPlus = new THREE.Vector3(0, 0, 1);

/** Given an angular diameter (degrees) at a radius, returns the plane's side. */
function planeSideForAngularDiameter(angleDegrees: number, radius: number): number {
  const halfAngle = (angleDegrees * 0.5 * Math.PI) / 180;
  return 2 * radius * Math.tan(halfAngle);
}

/** Nearest-filtering configuration for Sun / Moon textures (pixel-perfect Beta look). */
function configureCrispTexture(texture: THREE.Texture): void {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  if (hasTextureImageData(texture)) texture.needsUpdate = true;
}

function hasTextureImageData(texture: THREE.Texture): boolean {
  const image = texture.image as { width?: unknown; height?: unknown; data?: unknown } | undefined;
  return image != null && (
    (typeof image.width === 'number' && image.width > 0 && typeof image.height === 'number' && image.height > 0)
    || image.data !== undefined
  );
}

/**
 * Builds the sunrise-disc radial-gradient texture (a soft white circle
 * falling to fully transparent at the edge). Beta doesn't use a texture
 * for the disc — it uses a coloured triangle fan with per-vertex alpha —
 * but a radial-gradient texture reproduces the same visual on a single
 * quad in Three.js without needing a custom shader, and it lets us set
 * per-frame colour / opacity via material.color / material.opacity.
 */
function buildSunriseDiscTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = SUNRISE_DISC_TEXTURE_SIZE;
  canvas.height = SUNRISE_DISC_TEXTURE_SIZE;
  const context = canvas.getContext('2d');
  if (context === null) {
    throw new Error('Failed to acquire 2D context for sunrise disc texture.');
  }

  const centre = SUNRISE_DISC_TEXTURE_SIZE / 2;
  const gradient = context.createRadialGradient(centre, centre, 4, centre, centre, centre);
  gradient.addColorStop(0.0, 'rgba(255,255,255,1.0)');
  gradient.addColorStop(0.3, 'rgba(255,255,255,0.85)');
  gradient.addColorStop(0.7, 'rgba(255,255,255,0.25)');
  gradient.addColorStop(1.0, 'rgba(255,255,255,0.0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, SUNRISE_DISC_TEXTURE_SIZE, SUNRISE_DISC_TEXTURE_SIZE);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export interface CelestialState {
  readonly starOpacity: number;
  readonly sunAltitude: number;
}

export class CelestialRenderer {
  /** External-facing group. Parent SkyRenderer positions it at camera each frame. */
  public readonly group: THREE.Group;

  /** Inner group that carries the celestial rotation. Never translated directly. */
  private readonly celestialGroup: THREE.Group;

  private readonly sunMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly moonMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly sunriseMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly starField: StarField;

  private currentSunAltitude = 1;

  public constructor() {
    this.group = new THREE.Group();
    this.group.name = 'skyCelestialsRoot';
    this.group.frustumCulled = false;
    // Group renderOrder is a hint; each mesh sets its own renderOrder
    // below so we don't rely on inheritance.
    this.group.renderOrder = CELESTIAL_RENDER_ORDER;

    this.celestialGroup = new THREE.Group();
    this.celestialGroup.name = 'skyCelestialFrame';
    this.celestialGroup.frustumCulled = false;
    this.group.add(this.celestialGroup);

    const sunSize = planeSideForAngularDiameter(SUN_ANGULAR_DEGREES, CELESTIAL_RADIUS);
    const moonSize = planeSideForAngularDiameter(MOON_ANGULAR_DEGREES, CELESTIAL_RADIUS);

    // --- Sun ------------------------------------------------------------
    const textureLoader = new THREE.TextureLoader();
    const sunTexture = textureLoader.load(SUN_TEXTURE_PATH, configureCrispTexture);
    configureCrispTexture(sunTexture);
    const sunMaterial = new THREE.MeshBasicMaterial({
      map: sunTexture,
      color: 0xffffff,
      // Stage 16E: true-alpha transparent, drawn in the transparent
      // queue AFTER opaque terrain so depthTest reads real terrain
      // depths for occlusion. See the class-level comment for the full
      // rationale (premultiplied cutout was rejected — dark halos).
      transparent: true,
      depthTest: true,
      depthWrite: false,
      fog: false,
      side: THREE.FrontSide,
      blending: THREE.NormalBlending,
      toneMapped: false,
    });
    this.sunMesh = new THREE.Mesh(new THREE.PlaneGeometry(sunSize, sunSize), sunMaterial);
    this.sunMesh.name = 'sun';
    this.sunMesh.position.set(0, CELESTIAL_RADIUS, 0);
    // Face the plane inward toward the origin (camera).
    this.sunMesh.quaternion.setFromUnitVectors(worldForwardPlus, worldDown);
    this.sunMesh.renderOrder = CELESTIAL_RENDER_ORDER;
    this.sunMesh.frustumCulled = false;
    this.celestialGroup.add(this.sunMesh);

    // --- Moon -----------------------------------------------------------
    const moonTexture = textureLoader.load(MOON_TEXTURE_PATH, configureCrispTexture);
    configureCrispTexture(moonTexture);
    const moonMaterial = new THREE.MeshBasicMaterial({
      map: moonTexture,
      color: 0xffffff,
      // Stage 16E — same setup as sunMaterial; see class-level comment.
      transparent: true,
      depthTest: true,
      depthWrite: false,
      fog: false,
      side: THREE.FrontSide,
      blending: THREE.NormalBlending,
      toneMapped: false,
    });
    this.moonMesh = new THREE.Mesh(new THREE.PlaneGeometry(moonSize, moonSize), moonMaterial);
    this.moonMesh.name = 'moon';
    this.moonMesh.position.set(0, -CELESTIAL_RADIUS, 0);
    // Moon plane faces up toward origin.
    this.moonMesh.quaternion.setFromUnitVectors(worldForwardPlus, worldUp);
    this.moonMesh.renderOrder = CELESTIAL_RENDER_ORDER;
    this.moonMesh.frustumCulled = false;
    this.celestialGroup.add(this.moonMesh);

    // --- Sunrise / sunset disc ------------------------------------------
    // Small warm halo positioned near the sun. NormalBlending keeps its
    // contribution restrained; the sky-sphere horizon tint (SkyRenderer
    // applyColorState) carries the wider sunrise/sunset colour band.
    const sunriseMaterial = new THREE.MeshBasicMaterial({
      map: buildSunriseDiscTexture(),
      color: 0xffffff,
      transparent: true, // needs alpha blending for the radial fade
      opacity: 0,
      depthTest: true,
      depthWrite: false,
      fog: false,
      side: THREE.FrontSide,
      blending: THREE.NormalBlending,
      toneMapped: false,
    });
    this.sunriseMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(SUNRISE_DISC_RADIUS * 2, SUNRISE_DISC_RADIUS * 2),
      sunriseMaterial,
    );
    this.sunriseMesh.name = 'sunriseDisc';
    // Sit the disc a bit closer to the origin than the sun so it never
    // overpaints the sun disc itself; still parented to celestialGroup so
    // it rotates with the sun.
    this.sunriseMesh.position.set(0, CELESTIAL_RADIUS * 0.85, 0);
    this.sunriseMesh.quaternion.setFromUnitVectors(worldForwardPlus, worldDown);
    // Draw the halo behind the sun/moon in the same opaque-adjacent
    // pass. renderOrder just below the sun so it's painted before the
    // sun overlaps it, but still before terrain.
    this.sunriseMesh.renderOrder = CELESTIAL_RENDER_ORDER - 1;
    this.sunriseMesh.frustumCulled = false;
    this.sunriseMesh.visible = false;
    this.celestialGroup.add(this.sunriseMesh);

    // --- Stars ---------------------------------------------------------
    // Stage 16D: parented to the OUTER group, not celestialGroup, so the
    // starfield is world-fixed and does not rotate with the sun.
    this.starField = new StarField();
    this.group.add(this.starField.mesh);
  }

  /**
   * Applies the current celestial rotation and per-frame colour/opacity
   * driven by SkyColorState. Only rotation on X and opacity are ever
   * mutated — no reallocation, no geometry changes.
   *
   * Stage 18: weather fade multipliers (celestialFade for sun/moon/stars,
   * sunriseFade for the sunrise disc) are passed in so storms visibly
   * dim celestial bodies without needing bespoke logic here.
   */
  public update(
    state: SkyColorState,
    celestialFade = 1,
    sunriseFade = 1,
  ): CelestialState {
    // Beta rotates the celestial frame by `celestialAngle * 360` around X.
    // celestialAngle 0 = noon (sun overhead), 0.5 = midnight (moon overhead).
    this.celestialGroup.rotation.x = state.celestialAngle * Math.PI * 2;
    this.currentSunAltitude = state.sunAltitude;

    // Stars fade in with Beta's getStarBrightness. Weather-storm fade
    // further reduces visibility during rain/thunder.
    this.starField.setOpacity(state.starOpacity * celestialFade);

    // Sun / Moon: fade opacity by celestialFade.
    this.sunMesh.material.opacity = celestialFade;
    this.moonMesh.material.opacity = celestialFade;

    // Sunrise disc: visible only when calcSunriseSunsetColors returns non-null.
    if (state.sunriseSunset !== null) {
      const { r, g, b, a } = state.sunriseSunset;
      tempColor.setRGB(r, g, b, THREE.SRGBColorSpace);
      this.sunriseMesh.material.color.copy(tempColor);
      const dampedA = a * SUNRISE_ALPHA_DAMPING * sunriseFade;
      this.sunriseMesh.material.opacity = dampedA;
      this.sunriseMesh.visible = dampedA > 0.001;
    } else {
      this.sunriseMesh.visible = false;
      this.sunriseMesh.material.opacity = 0;
    }

    return {
      starOpacity: state.starOpacity,
      sunAltitude: state.sunAltitude,
    };
  }

  public getSunAltitude(): number {
    return this.currentSunAltitude;
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
