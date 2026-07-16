import * as THREE from 'three';
import type { ChunkManager } from '../../world/ChunkManager';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_SIZE_Y } from '../../world/chunkConstants';
import { JavaRandom } from '../../world/generation/random/JavaRandom';
import type { AtmosphericState } from '../AtmosphericState';

/**
 * Beta-style lightning bolts + short screen flash.
 *
 * Bolts (Stage 18B rewrite): procedural zigzag between top-solid ground
 * and the cloud layer, rendered as CAMERA-FACING QUAD STRIPS so bolts
 * actually appear ~1 block wide from any angle. The prior implementation
 * used `LineSegments` + `LineBasicMaterial` — WebGL discards
 * `linewidth > 1`, so lines were always 1 pixel wide regardless of
 * distance (the "too thin" bug the brief flags).
 *
 * For each active bolt, once per frame we rebuild its quad strip:
 * for each segment (p0 → p1), we compute a screen-space perpendicular
 * `perp = normalize(cross(segmentDir, cameraToSegment))` and emit two
 * triangles of world-space width `BOLT_WIDTH ≈ 1` block. Vertex colours
 * hold pale-blue outer + bright-white centre; additive blending sums
 * them for a bright core over any sky colour.
 *
 * Depth (Q5): `depthTest:true, depthWrite:false` — terrain naturally
 * occludes bolt fragments where geometry sits between the camera and
 * the bolt. Bolts never write depth so they don't corrupt water/other
 * transparents.
 *
 * Flash (Q4 in Stage 18): a per-frame [0, 1] value returned by
 * `getFlashStrength()`. Engine consumes it as a temporary SKYLIGHT
 * SUBTRACTION reduction — no voxel-light array touched, no chunk mesh
 * rebuilt. Structural verification asserts this class doesn't import
 * LightEngine or ChunkRenderer.
 */

/** Concurrent bolts capacity (Q6 in Stage 18). */
export const MAX_ACTIVE_BOLTS = 8;
/** Segments per bolt (Beta ~8 vertical). */
const BOLT_SEGMENTS = 8;
/** Bolt XZ jitter per interior segment (world blocks). */
const BOLT_JITTER = 0.6;
/** Bolt lifetime in real-time seconds. */
const BOLT_LIFETIME = 0.25;
/** Flash strength contribution per new bolt (Stage 18 Q4). */
const FLASH_PER_BOLT = 0.85;
/** Flash decay per second. */
const FLASH_DECAY_PER_SECOND = 6.0;
/** Bolt spawn probability per second at full thunder strength. */
const BOLT_RATE_AT_FULL_THUNDER = 0.35;
/** Y ceiling for bolt top — just below the cloud layer. */
const BOLT_TOP_Y = 108;

/**
 * Stage 18B: on-screen bolt width in world blocks. Beta bolts read as
 * ~1 block thick from a normal viewpoint; we render camera-facing
 * quads at this world width so the on-screen thickness is a stable
 * screen-space value.
 */
export const BOLT_WIDTH = 1.0;

/**
 * Vertex colours for bolts. Additive blending on a dark sky pushes the
 * summed pixels toward white; a subtle pale-blue rim colour gives the
 * "electric" tint the brief asks for without needing bloom.
 */
const BOLT_COLOR_CENTER = new THREE.Color(1.0, 1.0, 1.0);
const BOLT_COLOR_EDGE = new THREE.Color(0.60, 0.75, 1.0);

/** Audio hook signature (future). */
export type ThunderAudioHook = (x: number, y: number, z: number, distance: number) => void;

interface Bolt {
  active: boolean;
  age: number;
  segments: THREE.Vector3[]; // BOLT_SEGMENTS + 1 points
}

/** Reused scratch vectors for the quad-strip perpendicular math. */
const scratchSegDir = new THREE.Vector3();
const scratchCamDir = new THREE.Vector3();
const scratchPerp = new THREE.Vector3();

export class LightningRenderer {
  /**
   * Single triangle mesh holding every active bolt's quad strip.
   * Buffers are pre-allocated to the worst-case size so the per-frame
   * rebuild never allocates.
   */
  private readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly boltPool: Bolt[] = [];
  private readonly chunkManager: ChunkManager;
  private readonly boltRandom: JavaRandom;
  private flashStrength = 0;
  private audioHook: ThunderAudioHook | null = null;

  public constructor(scene: THREE.Scene, chunkManager: ChunkManager, sessionSeed: bigint) {
    this.chunkManager = chunkManager;
    this.boltRandom = new JavaRandom(sessionSeed ^ 0x1e17b01n);

    // Pre-size buffers for the worst case: every bolt fully active,
    // every segment emitted as one quad = 4 vertices, 2 triangles.
    const maxQuads = MAX_ACTIVE_BOLTS * BOLT_SEGMENTS;
    const maxVerts = maxQuads * 4;
    const maxIndices = maxQuads * 6;

    const positions = new Float32Array(maxVerts * 3);
    const colors = new Float32Array(maxVerts * 3);
    const indices = new Uint16Array(maxIndices);

    // Bake the index buffer once — quad topology never changes.
    for (let q = 0; q < maxQuads; q++) {
      const b = q * 4;
      const i = q * 6;
      indices[i + 0] = b + 0;
      indices[i + 1] = b + 1;
      indices[i + 2] = b + 2;
      indices[i + 3] = b + 0;
      indices[i + 4] = b + 2;
      indices[i + 5] = b + 3;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
    );
    geometry.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage),
    );
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    // Big bounding sphere so frustum culling never hides mid-flight bolts.
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    geometry.setDrawRange(0, 0);

    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      depthTest: true,   // Q5: terrain occludes bolts naturally
      depthWrite: false, // never write depth (would occlude water etc.)
      fog: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = 'lightningBolts';
    this.mesh.renderOrder = 30;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);

    for (let i = 0; i < MAX_ACTIVE_BOLTS; i++) {
      this.boltPool.push({
        active: false,
        age: 0,
        segments: Array.from({ length: BOLT_SEGMENTS + 1 }, () => new THREE.Vector3()),
      });
    }
  }

  public setAudioHook(hook: ThunderAudioHook | null): void {
    this.audioHook = hook;
  }

  public update(
    cameraX: number,
    cameraY: number,
    cameraZ: number,
    deltaSeconds: number,
    atmos: AtmosphericState,
    strikeRadius: number,
    camera?: THREE.PerspectiveCamera,
  ): void {
    // Age active bolts.
    let activeCount = 0;
    for (const b of this.boltPool) {
      if (!b.active) continue;
      b.age += deltaSeconds;
      if (b.age >= BOLT_LIFETIME) {
        b.active = false;
      } else {
        activeCount++;
      }
    }

    // Decay flash.
    this.flashStrength -= FLASH_DECAY_PER_SECOND * deltaSeconds;
    if (this.flashStrength < 0) this.flashStrength = 0;

    // Attempt strikes when thundering.
    if (atmos.thunderStrength > 0.001) {
      const rate = BOLT_RATE_AT_FULL_THUNDER * atmos.thunderStrength;
      if (this.boltRandom.nextDouble() < rate * deltaSeconds) {
        this.trySpawnBolt(cameraX, cameraY, cameraZ, strikeRadius);
      }
    }

    // Rebuild camera-facing quad-strip geometry.
    const posAttr = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = this.mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
    const positions = posAttr.array as Float32Array;
    const colors = colAttr.array as Float32Array;

    // Camera world position for perpendicular math. If no camera was
    // passed we fall back to the last-known camera-eye XYZ so the
    // renderer still produces sensible width.
    const cameraPos = camera?.getWorldPosition(scratchCamDir.set(0, 0, 0)) ??
      scratchCamDir.set(cameraX, cameraY, cameraZ);

    let writeVertIdx = 0;
    let writeQuadIdx = 0;
    const half = BOLT_WIDTH * 0.5;

    for (const b of this.boltPool) {
      if (!b.active) continue;
      // Age-based opacity ramp: 1.0 at start, 0.0 at end. Multiplies
      // vertex colours so bolts flicker out smoothly.
      const ageT = b.age / BOLT_LIFETIME;
      const ageFade = 1 - ageT;

      for (let s = 0; s < BOLT_SEGMENTS; s++) {
        const p0 = b.segments[s]!;
        const p1 = b.segments[s + 1]!;

        // Segment direction.
        scratchSegDir.subVectors(p1, p0);
        const segLen = scratchSegDir.length();
        if (segLen < 1e-6) continue;
        scratchSegDir.divideScalar(segLen);

        // Camera-to-segment direction (use segment midpoint).
        scratchPerp.copy(p0).lerp(p1, 0.5).sub(cameraPos).normalize();

        // Perpendicular = normalize(cross(segDir, camDir)). Points
        // sideways to the segment in the plane perpendicular to the
        // camera line-of-sight — i.e. the quad faces the camera.
        scratchPerp.crossVectors(scratchSegDir, scratchPerp);
        const perpLen = scratchPerp.length();
        if (perpLen < 1e-6) {
          // Segment is (near-)parallel to camera direction; skip so we
          // don't emit a degenerate zero-area quad.
          continue;
        }
        scratchPerp.divideScalar(perpLen).multiplyScalar(half);

        // Vertex 0..3 in CCW order:
        //   0: p0 - perp
        //   1: p0 + perp
        //   2: p1 + perp
        //   3: p1 - perp
        const px = scratchPerp.x, py = scratchPerp.y, pz = scratchPerp.z;
        const v0x = p0.x - px, v0y = p0.y - py, v0z = p0.z - pz;
        const v1x = p0.x + px, v1y = p0.y + py, v1z = p0.z + pz;
        const v2x = p1.x + px, v2y = p1.y + py, v2z = p1.z + pz;
        const v3x = p1.x - px, v3y = p1.y - py, v3z = p1.z - pz;

        const base = writeVertIdx;
        positions[base * 3 + 0] = v0x;
        positions[base * 3 + 1] = v0y;
        positions[base * 3 + 2] = v0z;
        positions[base * 3 + 3] = v1x;
        positions[base * 3 + 4] = v1y;
        positions[base * 3 + 5] = v1z;
        positions[base * 3 + 6] = v2x;
        positions[base * 3 + 7] = v2y;
        positions[base * 3 + 8] = v2z;
        positions[base * 3 + 9] = v3x;
        positions[base * 3 + 10] = v3y;
        positions[base * 3 + 11] = v3z;

        // Outer verts (0, 3 are one side; 1, 2 are the other) get the
        // pale-blue rim; using per-vertex vs per-strip colours would
        // add stitching between segments. Simpler: bright-white centre
        // between two blue rims — encoded here as edge colours × ageFade.
        const eR = BOLT_COLOR_EDGE.r * ageFade;
        const eG = BOLT_COLOR_EDGE.g * ageFade;
        const eB = BOLT_COLOR_EDGE.b * ageFade;
        // Verts 0 and 3 sit on the "−perp" side; verts 1 and 2 on
        // "+perp". Both are edges of the strip so both get edge tint.
        // The white core is achieved by the STRIP itself being narrow
        // enough that centred pixels see additive contributions from
        // multiple strips.
        //
        // For a truly bright centre with a single strip we blend:
        // verts 0,3 = edge; verts 1,2 = centre.
        void BOLT_COLOR_CENTER; // referenced below for clarity
        // Actually give it a proper bright-centre gradient by lerping
        // between edge and centre on the two rows of the strip:
        //   verts 0, 3 = edge; verts 1, 2 = edge (same side, but strip
        // is 1-block wide — for stronger effect flip one row to centre).
        //
        // To make the centre bright without a two-strip approach, we
        // use white for BOTH rows and rely on additive blending to
        // saturate: a bolt against a dark sky reads white in the middle
        // and picks up a blue rim from anti-aliased edge pixels.
        colors[base * 3 + 0] = eR;
        colors[base * 3 + 1] = eG;
        colors[base * 3 + 2] = eB;
        colors[base * 3 + 3] = BOLT_COLOR_CENTER.r * ageFade;
        colors[base * 3 + 4] = BOLT_COLOR_CENTER.g * ageFade;
        colors[base * 3 + 5] = BOLT_COLOR_CENTER.b * ageFade;
        colors[base * 3 + 6] = BOLT_COLOR_CENTER.r * ageFade;
        colors[base * 3 + 7] = BOLT_COLOR_CENTER.g * ageFade;
        colors[base * 3 + 8] = BOLT_COLOR_CENTER.b * ageFade;
        colors[base * 3 + 9] = eR;
        colors[base * 3 + 10] = eG;
        colors[base * 3 + 11] = eB;

        writeVertIdx += 4;
        writeQuadIdx += 1;
      }
    }

    // Zero any leftover vertex/colour slots so stale segments never
    // leak into the draw range (safety belt).
    for (let i = writeVertIdx * 3; i < positions.length; i++) positions[i] = 0;
    for (let i = writeVertIdx * 3; i < colors.length; i++) colors[i] = 0;

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    this.mesh.geometry.setDrawRange(0, writeQuadIdx * 6);
    this.mesh.visible = activeCount > 0;
  }

  /** Current flash multiplier ∈ [0, 1]. Consumed by Engine. */
  public getFlashStrength(): number {
    return this.flashStrength;
  }

  public getActiveBoltCount(): number {
    let n = 0;
    for (const b of this.boltPool) if (b.active) n++;
    return n;
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.removeFromParent();
  }

  private trySpawnBolt(
    cameraX: number,
    _cameraY: number,
    cameraZ: number,
    strikeRadius: number,
  ): void {
    const dx = (this.boltRandom.nextDouble() * 2 - 1) * strikeRadius;
    const dz = (this.boltRandom.nextDouble() * 2 - 1) * strikeRadius;
    const worldX = Math.floor(cameraX + dx);
    const worldZ = Math.floor(cameraZ + dz);

    const chunk = this.chunkManager.getChunk(
      Math.floor(worldX / CHUNK_SIZE_X),
      Math.floor(worldZ / CHUNK_SIZE_Z),
    );
    if (!chunk) return;
    const localX = ((worldX % CHUNK_SIZE_X) + CHUNK_SIZE_X) % CHUNK_SIZE_X;
    const localZ = ((worldZ % CHUNK_SIZE_Z) + CHUNK_SIZE_Z) % CHUNK_SIZE_Z;
    const groundY = chunk.getHeight(localX, localZ);
    if (groundY <= 0 || groundY >= CHUNK_SIZE_Y - 1) return;

    let bolt: Bolt | null = null;
    for (const b of this.boltPool) {
      if (!b.active) { bolt = b; break; }
    }
    if (!bolt) return;

    const bottom = groundY;
    const top = BOLT_TOP_Y;
    const totalHeight = top - bottom;
    for (let i = 0; i <= BOLT_SEGMENTS; i++) {
      const t = i / BOLT_SEGMENTS;
      const y = bottom + t * totalHeight;
      const jx = i === 0 || i === BOLT_SEGMENTS
        ? 0
        : (this.boltRandom.nextDouble() * 2 - 1) * BOLT_JITTER;
      const jz = i === 0 || i === BOLT_SEGMENTS
        ? 0
        : (this.boltRandom.nextDouble() * 2 - 1) * BOLT_JITTER;
      bolt.segments[i]!.set(worldX + 0.5 + jx, y, worldZ + 0.5 + jz);
    }
    bolt.active = true;
    bolt.age = 0;

    this.flashStrength = Math.min(1, this.flashStrength + FLASH_PER_BOLT);

    if (this.audioHook) {
      const distance = Math.hypot(worldX - cameraX, groundY - _cameraY, worldZ - cameraZ);
      this.audioHook(worldX, groundY, worldZ, distance);
    }
  }
}
