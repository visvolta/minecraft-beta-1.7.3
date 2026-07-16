import * as THREE from 'three';
import { JavaRandom } from '../../world/generation/random/JavaRandom';

/**
 * Deterministic starfield ported from Beta 1.7.3 RenderGlobal.renderStars.
 *
 * Beta's original algorithm:
 *   Random random = new Random(10842L);
 *   for (i = 0; i < 1500; i++) {
 *     rejection-sample unit direction, radius 100;
 *     size = 0.25 + rand * 0.25;   // Beta ~0.25..0.5
 *     roll = rand * 2π;
 *     for (int j = 0; j < 4; j++) {
 *       ... atan2-orientation math builds 4 baked quad corners ...
 *       tessellator.addVertex(...);
 *     }
 *   }
 *
 * This class ports that algorithm bit-for-bit using our JavaRandom, then
 * bakes every vertex into ONE static `THREE.BufferGeometry`. Nothing about
 * the geometry ever changes after construction: the only per-frame update
 * is the material's `opacity`. Result: zero jitter, zero rotation with
 * the camera (rotation is applied to the parent CelestialRenderer group),
 * and zero degenerate/stretched triangles because the quads are baked in
 * world orientation, not billboarded to the camera.
 *
 * Approved tuning (see Stage 16 plan):
 *   - Base size scaled ~1.4× Beta so stars are easier to see on modern
 *     displays. Still baked, still deterministic.
 *   - Per-star brightness variation baked into vertex colours (0.7..1.0).
 *   - Per-star size variation preserved from Beta's own `0.25 + rand*0.25`
 *     term, kept within the scaled range so no star ever becomes so small
 *     it under-samples to a line on a 4K display.
 *
 * Depth / blend setup (Stage 16D)
 * -------------------------------
 * Previously depthTest was false and stars painted over everything
 * regardless of terrain — so an underground player could still see them.
 * Stage 16D flips depthTest on so terrain's opaque depth writes occlude
 * stars naturally, matching the Sun / Moon occlusion fix:
 *
 *   - depthTest:  true     — terrain occludes stars.
 *   - depthWrite: false    — stars never occlude terrain.
 *   - fog: false           — stars are celestial, not terrain-distance.
 *   - blending: Additive   — matches Beta's glBlendFunc(GL_SRC_ALPHA, GL_ONE).
 *                            Additive is retained because stars are
 *                            small, sparse light points against a dark
 *                            sky — normal blend would make them invisible.
 *                            Their contribution is naturally small
 *                            enough not to bloom.
 *   - transparent: true    — required for AdditiveBlending. This puts
 *                            the star mesh in the transparent queue —
 *                            which runs after opaque terrain — so the
 *                            depth test above is what actually enforces
 *                            terrain occlusion.
 *   - renderOrder: -1      — drawn early within the transparent queue
 *                            (before other transparent objects like
 *                            water) but after opaque terrain has
 *                            written depth.
 *
 * Parent (Stage 16D fix): mounted directly on the sky root group in
 * CelestialRenderer — NOT on celestialGroup. Stars therefore inherit
 * only translation (camera-follow), never rotation, so they stay fixed
 * on the celestial sphere and only fade with material.opacity.
 */

const STAR_COUNT = 1500;
const STAR_SEED = 10842n;
/**
 * Star sphere radius. Stage 18 raises this (from Beta's literal 100
 * blocks) in tandem with CelestialRenderer so the celestial dome sits
 * BEHIND the visible cloud fragments — clouds obscure stars where
 * their sky-space paths cross. Star size is scaled by the same factor
 * so on-screen appearance is preserved.
 */
const STAR_RADIUS = 480;
const STAR_RADIUS_SCALE_VS_BETA = STAR_RADIUS / 100;

/**
 * Multiplier applied to Beta's per-star base size. Beta uses `0.25 + rand*0.25`
 * (so 0.25..0.5). Scaling by ~1.4 keeps the classic look but keeps stars
 * visible on modern high-DPI displays without turning them into blobs.
 */
const STAR_SIZE_SCALE = 1.4;

/** Per-star brightness range baked into vertex colours (Beta uses uniform 1.0). */
const STAR_MIN_BRIGHTNESS = 0.7;
const STAR_MAX_BRIGHTNESS = 1.0;

export class StarField {
  public readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;

  private readonly material: THREE.MeshBasicMaterial;

  public constructor() {
    const geometry = this.buildBetaGeometry();

    this.material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      // Stage 16D: enable depth testing so terrain properly occludes.
      depthTest: true,
      depthWrite: false,
      fog: false,
      side: THREE.FrontSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = 'stars';
    this.mesh.renderOrder = -1;
    this.mesh.frustumCulled = false;
  }

  /**
   * Adjust visibility. Called once per frame with Beta's getStarBrightness
   * (already scaled by 1 − rainStrength in real Beta; we have no weather).
   */
  public setOpacity(opacity: number): void {
    const clamped = opacity < 0 ? 0 : opacity > 1 ? 1 : opacity;
    this.material.opacity = clamped;
    this.mesh.visible = clamped > 0.001;
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }

  /**
   * Bakes every star's four quad corners into one indexed BufferGeometry.
   *
   * Ported bit-for-bit from Beta 1.7.3 RenderGlobal.renderStars(). The
   * Stage 16 port had a mis-transcribed pitch/yaw step which produced
   * edge-on quads for stars near the ±Y poles (they projected as vertical
   * lines) — the "stars stretched into lines" bug the brief flags. This
   * version follows the decompiled Java `d..` variables in the same
   * order, verified against a straight-up-star reference.
   *
   * Beta reference (RenderGlobal.renderStars, mc-dev):
   *   d3   = 0.25 + rand*0.25       // per-star size (side)
   *   d5,d6,d7                       // world position (dir * 100)
   *   d8   = atan2(d, d2)            // Beta calls d=nx, d2=nz  → this is yaw
   *   d9   = sin(d8)  d10 = cos(d8)
   *   d11  = atan2(sqrt(d*d+d2*d2), d1)  // pitch off +Y
   *   d12  = sin(d11) d13 = cos(d11)
   *   d14  = rand * 2π  → per-star roll
   *   d15  = sin(d14) d16 = cos(d14)
   *   for j in 0..3:
   *     d17 = 0
   *     d18 = ((j    & 2) - 1) * d3       // in-plane axis 1 offset
   *     d19 = (((j+1)& 2) - 1) * d3       // in-plane axis 2 offset
   *     d20 = d17
   *     d21 = d18*d16 - d19*d15           // roll around plane normal
   *     d22 = d19*d16 + d18*d15
   *     d23 = d22
   *     d24 = d21*d12 + d20*d13           // pitch: send rolled Y into world Y
   *     d25 = d20*d12 - d21*d13           // pitch: rolled Y kept for world X/Z
   *     d26 = d25*d9  - d23*d10           // yaw:  world X
   *     d27 = d24                         //       world Y
   *     d28 = d23*d9  + d25*d10           //       world Z
   *     addVertex(d5+d26, d6+d27, d7+d28)
   *
   * Since d20 is always 0, the algebra reduces to:
   *   worldX = -rolledY*cosPitch*sinYaw - rolledZ*cosYaw
   *   worldY =  rolledY*sinPitch
   *   worldZ = -rolledY*cosPitch*cosYaw + rolledZ*sinYaw
   *
   * Approved deviations from Beta:
   *   - STAR_SIZE_SCALE multiplier on `d3` for modern displays.
   *   - Per-star brightness baked into the vertex colour buffer
   *     (Beta uses uniform 1.0).
   *   - Degenerate-star `continue` skip preserved (Beta radius outside
   *     0.01..1); RNG stream still advances so per-star determinism is
   *     bit-for-bit Beta-identical.
   */
  private buildBetaGeometry(): THREE.BufferGeometry {
    const random = new JavaRandom(STAR_SEED);

    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    let baseIndex = 0;

    for (let i = 0; i < STAR_COUNT; i++) {
      // Beta samples all six random values up front. Ordering must match.
      const rx = random.nextFloat() * 2 - 1;
      const ry = random.nextFloat() * 2 - 1;
      const rz = random.nextFloat() * 2 - 1;
      const rSize = random.nextFloat();
      const rRoll = random.nextDouble();
      const rBright = random.nextFloat();

      const lenSq = rx * rx + ry * ry + rz * rz;
      if (lenSq >= 1 || lenSq <= 0.01) {
        continue;
      }

      const invLen = 1 / Math.sqrt(lenSq);
      const nx = rx * invLen; // Beta d
      const ny = ry * invLen; // Beta d1
      const nz = rz * invLen; // Beta d2

      // World position on the celestial sphere.
      const px = nx * STAR_RADIUS; // d5
      const py = ny * STAR_RADIUS; // d6
      const pz = nz * STAR_RADIUS; // d7

      // Per-star size, scaled for modern displays. `d3`.
      const size = (0.25 + rSize * 0.25) * STAR_SIZE_SCALE * STAR_RADIUS_SCALE_VS_BETA;

      // Yaw around +Y  (Beta d8 = atan2(nx, nz)).
      const sinYaw = Math.sin(Math.atan2(nx, nz)); // d9
      const cosYaw = Math.cos(Math.atan2(nx, nz)); // d10
      // Pitch off +Y   (Beta d11 = atan2(sqrt(nx²+nz²), ny)).
      const horiz = Math.sqrt(nx * nx + nz * nz);
      const sinPitch = Math.sin(Math.atan2(horiz, ny)); // d12
      const cosPitch = Math.cos(Math.atan2(horiz, ny)); // d13
      // Per-star roll around the quad's outward normal (Beta d14).
      const roll = rRoll * Math.PI * 2;
      const sinRoll = Math.sin(roll); // d15
      const cosRoll = Math.cos(roll); // d16

      const brightness =
        STAR_MIN_BRIGHTNESS + (STAR_MAX_BRIGHTNESS - STAR_MIN_BRIGHTNESS) * rBright;

      // Emit four corners in Beta's exact order. Each vertex uses the
      // reduced algebra derived above (d17 = d20 = 0 in the source).
      for (let j = 0; j < 4; j++) {
        const d18 = ((j & 2) - 1) * size;
        const d19 = (((j + 1) & 2) - 1) * size;

        // Roll around the plane normal.
        const rolledY = d18 * cosRoll - d19 * sinRoll; // d21
        const rolledZ = d19 * cosRoll + d18 * sinRoll; // d22 (== d23)

        // Pitch + Yaw into world space (see the reduced formulas above).
        const wx = -rolledY * cosPitch * sinYaw - rolledZ * cosYaw;
        const wy = rolledY * sinPitch;
        const wz = -rolledY * cosPitch * cosYaw + rolledZ * sinYaw;

        positions.push(px + wx, py + wy, pz + wz);
        colors.push(brightness, brightness, brightness);
      }

      // Beta uses GL_QUADS; index as two triangles.
      indices.push(baseIndex + 0, baseIndex + 1, baseIndex + 2);
      indices.push(baseIndex + 0, baseIndex + 2, baseIndex + 3);
      baseIndex += 4;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    // Explicit oversized bounding sphere so frustum culling never clips
    // stars behind the camera when we look straight up.
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), STAR_RADIUS * 1.5);
    return geometry;
  }
}
