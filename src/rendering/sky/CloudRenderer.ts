import * as THREE from 'three';
import type { CloudColor } from './SkyColorController';

/**
 * Beta 1.7.3 fancy-cloud layer.
 *
 * Geometry
 * --------
 * Beta's fancy clouds are axis-aligned box cells `12 × 4 × 12` blocks,
 * with the cloud layer occupying Y = 108 (bottom) to Y = 112 (top).
 * Occupancy comes directly from a 256×256 texture: one texel = one
 * cloud cell, so the pattern tiles every 256 × 12 = 3072 world blocks.
 * A cell is "filled" when the texture's red channel > 0 (the supplied
 * clouds.png is 1-bit palettised: black = empty, white = filled).
 *
 * Rendering
 * ---------
 * The brief mandates real internal-face culling (Beta itself doesn't
 * cull — it relies on depth). We build one indexed BufferGeometry
 * containing only the EXPOSED faces of each filled cell, so cloud-vs-
 * cloud overdraw is impossible and single-pass alpha blending stays
 * artefact-free.
 *
 * Directional face brightness (multiplied into the SkyColorController
 * cloud colour before being baked into vertex colours):
 *   - Top faces (+Y):    ×1.0
 *   - Side faces (±X, ±Z): ×0.9
 *   - Bottom faces (−Y): ×0.7
 *
 * Material (Stage 17B refactor): FULLY OPAQUE. Prior stages used
 * `transparent:true` + `NormalBlending` + fixed alpha 0.8. Stage 17B
 * makes clouds a deliberate opaque style choice:
 *
 *   - transparent: false, blending: NoBlending, opacity: 1
 *   - alpha vertex channel stays but is always 1 (kept in the buffer
 *     only to avoid changing the geometry stride)
 *   - depthTest: true, depthWrite: true (opaque materials write depth)
 *   - fog: false — clouds sit ABOVE the horizon-fog height taper; the
 *     terrain fog would otherwise wash them out at distance
 *   - renderOrder: 10 — with transparent:false Three puts this in the
 *     OPAQUE queue. Opaque queue draws in renderOrder ASCENDING, so
 *     terrain (0) paints first with depth writes, then clouds (10)
 *     paint with depthTest passing where they're in front and
 *     writing their own depth (which then correctly occludes any
 *     transparent water at renderOrder 20).
 *
 * Movement / infinity illusion
 * ----------------------------
 * Cloud world speed is fixed at 0.6 blocks/second along −X — Beta's own
 * value (cloudOffsetX++ per 20 tps × 0.03 blocks/tick). The world-space
 * accumulated offset is stored in `cloudOffsetX`.
 *
 * Rather than moving the mesh forever (which would jitter at large
 * coordinates), the cloud group is repositioned each frame to the
 * camera's cell-snapped origin. The mesh itself lives in local space
 * around that origin. Sub-cell offsets (both wind and camera position
 * modulo cell size) are applied as a small local translation of the
 * mesh inside the group — so world coordinates never grow.
 *
 * Occupancy geometry is rebuilt whenever the camera's cell coordinates
 * change (every 12 blocks travelled in X or Z). At worst, ~once per
 * ~4 seconds when walking normally. Rebuild cost is one pass over
 * `GRID_CELLS² = 48² = 2304` cells and a handful of dozen face pushes
 * per filled cell.
 */

/** Cloud pattern texture. Palettised 256×256; loaded once, tiled forever. */
const CLOUD_TEXTURE_PATH = '/textures/environment/clouds.png';
const CLOUD_TEXTURE_SIZE = 256;

/** Beta cloud cell footprint (blocks per side, horizontally). */
export const CLOUD_CELL_SIZE = 12;

/** Beta cloud cell height in blocks. */
export const CLOUD_CELL_HEIGHT = 4;

/** Beta cloud layer altitude — bottom Y in world coordinates. */
export const CLOUD_BOTTOM_Y = 108;
export const CLOUD_TOP_Y = CLOUD_BOTTOM_Y + CLOUD_CELL_HEIGHT; // 112

/**
 * Number of cloud cells along each horizontal axis of the visible grid.
 * Beta fancy iterates 48 cells (6 tiles of 8 cells) around the player,
 * covering 576 × 576 blocks — larger than any current chunk load radius.
 */
export const CLOUD_GRID_CELLS = 48;

/**
 * Stage 17B: clouds are fully opaque. The alpha vertex channel is kept
 * (buffer layout unchanged) but every vertex writes 1.0. If a future
 * stage wants Beta's original 0.8-alpha translucent mode back, it's a
 * one-line constant change here plus flipping `transparent`.
 */
const CLOUD_ALPHA = 1.0;

/**
 * Cloud drift speed in world blocks per real-time second, along −X.
 * Beta uses `cloudOffsetX++` per tick × 0.03 blocks/tick = 0.6 blk/s.
 */
export const CLOUD_WIND_SPEED = 0.6;

/**
 * Face brightness multipliers applied to the cloud base colour before
 * baking into vertex colours. Match the brief's spec exactly.
 */
const TOP_BRIGHTNESS = 1.0;
const SIDE_BRIGHTNESS = 0.9;
const BOTTOM_BRIGHTNESS = 0.7;

/**
 * Explicit renderOrder for the cloud mesh. Sits between opaque terrain
 * (renderOrder 0) and water / lava / cutout leaves (renderOrder 20).
 */
export const CLOUD_RENDER_ORDER = 10;

/** Total horizontal extent of the visible cloud grid, in world blocks. */
const CLOUD_GRID_EXTENT = CLOUD_GRID_CELLS * CLOUD_CELL_SIZE;

/**
 * Injects a per-fragment fog-strength multiplier into the cloud
 * material's stock Three.js fog computation. Reuses Three's own
 * `<fog_fragment>` `fogFactor` and only multiplies it by
 * `uCloudFogStrength` (0..1) before the mix — keeps cloud fog
 * substantially weaker than terrain fog without touching Three's
 * FogExp2 / Fog branches.
 */
function attachCloudFogModifier(material: THREE.MeshBasicMaterial): void {
  const uniforms = { uCloudFogStrength: { value: 0.35 } };
  material.userData.cloudFogUniforms = uniforms;
  material.onBeforeCompile = (shader): void => {
    shader.uniforms.uCloudFogStrength = uniforms.uCloudFogStrength;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        #ifdef USE_FOG
          uniform float uCloudFogStrength;
        #endif`,
      )
      .replace(
        '#include <fog_fragment>',
        `
        #ifdef USE_FOG
          #ifdef FOG_EXP2
            float cloudFogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
          #else
            float cloudFogFactor = smoothstep( fogNear, fogFar, vFogDepth );
          #endif
          cloudFogFactor *= uCloudFogStrength;
          gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, cloudFogFactor );
        #endif
        `,
      );
  };
  material.needsUpdate = true;
}

interface CloudDebugInfo {
  readonly cloudOffsetX: number;
  readonly windSpeedBlocksPerSecond: number;
  readonly colorHex: number;
  readonly cellCountVisible: number;
}

export class CloudRenderer {
  /** Root group placed at the camera's cell-snapped origin every frame. */
  private readonly root: THREE.Group;

  /** Inner mesh; local-space geometry offset by wind + sub-cell position. */
  private mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null = null;

  private readonly material: THREE.MeshBasicMaterial;

  private readonly occupancy: Uint8Array = new Uint8Array(
    CLOUD_TEXTURE_SIZE * CLOUD_TEXTURE_SIZE,
  );
  private occupancyReady = false;

  /** Camera-cell coordinates the current geometry was built for. */
  private lastCellCameraX = Number.NaN;
  private lastCellCameraZ = Number.NaN;
  /**
   * Cumulative whole-cell wind offset the current geometry was built
   * for. Sampled into the texture as a cell shift so, as wind drifts
   * past one cell, the visible pattern actually moves.
   */
  private lastWindCellsX = Number.NaN;

  /** Accumulated wind offset in world blocks along −X. */
  private cloudOffsetX = 0;

  /** Baked cloud colour for the last frame (for the F3 overlay). */
  private lastColor: CloudColor = { r: 1, g: 1, b: 1, hex: 0xffffff };

  /** How many filled cells were emitted in the current geometry. */
  private lastCellCountVisible = 0;

  public constructor(scene: THREE.Scene) {
    this.root = new THREE.Group();
    this.root.name = 'cloudLayer';
    this.root.frustumCulled = false;
    this.root.renderOrder = CLOUD_RENDER_ORDER;
    scene.add(this.root);

    this.material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      // Stage 17B: fully opaque style choice. Alpha vertex channel
      // exists in the geometry buffer but every filled vertex writes
      // 1.0; the material never blends.
      transparent: false,
      depthTest: true,
      depthWrite: true,
      // Stage 18: re-enable fog on clouds with a small shader-injected
      // multiplier (`uCloudFogStrength`). Terrain fog would otherwise
      // wash the layer out at distance; the multiplier keeps the
      // horizon boundary of the cloud layer soft without collapsing the
      // whole layer to a small circle. Multiplier is set per-frame
      // from AtmosphericState.cloudFogStrength (Q4).
      fog: true,
      side: THREE.DoubleSide,
      blending: THREE.NoBlending,
      toneMapped: false,
    });
    attachCloudFogModifier(this.material);

    // Kick off async texture load. Cloud mesh stays empty until it
    // arrives (typically ~1 frame given the tiny 256-byte PNG size).
    this.loadOccupancyTexture();
  }

  /**
   * Called by Engine each frame. Positions the layer at the camera's
   * cell-snapped origin, advances the wind offset, rebuilds geometry
   * when the camera crosses a cell boundary, and applies the given
   * per-frame cloud colour to the vertex colour buffer.
   */
  public update(
    cameraX: number,
    cameraZ: number,
    deltaSeconds: number,
    cloudColor: CloudColor,
    cloudFogStrength: number = 0.35,
  ): void {
    if (!this.occupancyReady) {
      return;
    }

    // Update the shader-side fog strength uniform once per frame.
    // Stage 18: driven by AtmosphericState.cloudFogStrength.
    const uniforms = this.material.userData
      .cloudFogUniforms as { uCloudFogStrength: { value: number } } | undefined;
    if (uniforms !== undefined) {
      uniforms.uCloudFogStrength.value = cloudFogStrength;
    }

    this.cloudOffsetX += CLOUD_WIND_SPEED * deltaSeconds;
    this.lastColor = cloudColor;

    // Cell-snap the camera. The camera-cell integer determines which
    // 48×48 window of the texture is currently visible; the sub-cell
    // remainder + the wind offset become the mesh's local translation
    // so the layer appears to scroll continuously.
    const cellCameraX = Math.floor(cameraX / CLOUD_CELL_SIZE);
    const cellCameraZ = Math.floor(cameraZ / CLOUD_CELL_SIZE);

    // Whole-cell wind shift (in cells, always ≤ 0 since wind is toward −X).
    const windOffsetXBlocks = -this.cloudOffsetX;
    const windCellsX = Math.floor(windOffsetXBlocks / CLOUD_CELL_SIZE);
    const windSubX = windOffsetXBlocks - windCellsX * CLOUD_CELL_SIZE;

    if (
      cellCameraX !== this.lastCellCameraX ||
      cellCameraZ !== this.lastCellCameraZ ||
      windCellsX !== this.lastWindCellsX
    ) {
      // Rebuild uses the cell-shifted camera window so the occupancy
      // scroll follows the wind as it accumulates past one cell.
      this.rebuildGeometry(cellCameraX - windCellsX, cellCameraZ, cloudColor);
      this.lastCellCameraX = cellCameraX;
      this.lastCellCameraZ = cellCameraZ;
      this.lastWindCellsX = windCellsX;
    } else {
      // Same cell + same wind cell as last frame — just refresh vertex colours.
      this.updateVertexColors(cloudColor);
    }

    // Root position = the world-space bottom-left corner of the visible
    // grid, snapped to the camera cell. Sub-cell wind offset is added
    // so the layer scrolls smoothly between rebuilds.
    const gridOriginX = cellCameraX * CLOUD_CELL_SIZE - (CLOUD_GRID_EXTENT / 2);
    const gridOriginZ = cellCameraZ * CLOUD_CELL_SIZE - (CLOUD_GRID_EXTENT / 2);
    this.root.position.set(gridOriginX + windSubX, 0, gridOriginZ);
  }

  public getDebugInfo(): CloudDebugInfo {
    return {
      cloudOffsetX: this.cloudOffsetX,
      windSpeedBlocksPerSecond: CLOUD_WIND_SPEED,
      colorHex: this.lastColor.hex,
      cellCountVisible: this.lastCellCountVisible,
    };
  }

  public dispose(): void {
    this.disposeMesh();
    this.material.dispose();
    this.root.removeFromParent();
  }

  // ---------------------------------------------------------------------------
  // Texture loading
  // ---------------------------------------------------------------------------

  private loadOccupancyTexture(): void {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = (): void => {
      const canvas = document.createElement('canvas');
      canvas.width = CLOUD_TEXTURE_SIZE;
      canvas.height = CLOUD_TEXTURE_SIZE;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx === null) return;
      ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, CLOUD_TEXTURE_SIZE, CLOUD_TEXTURE_SIZE).data;
      // Fill = red channel > 127. The supplied clouds.png is 1-bit
      // palettised: black = empty, white = filled. Any non-black pixel
      // is treated as filled.
      for (let i = 0, out = 0; i < pixels.length; i += 4, out++) {
        this.occupancy[out] = pixels[i]! > 127 ? 1 : 0;
      }
      this.occupancyReady = true;
    };
    image.onerror = (): void => {
      // Non-fatal: cloud renderer just stays empty. Log for diagnostics.
      // eslint-disable-next-line no-console
      console.error(`[CloudRenderer] failed to load ${CLOUD_TEXTURE_PATH}`);
    };
    image.src = CLOUD_TEXTURE_PATH;
  }

  // ---------------------------------------------------------------------------
  // Geometry build with internal-face culling
  // ---------------------------------------------------------------------------

  private rebuildGeometry(
    cellCameraX: number,
    cellCameraZ: number,
    cloudColor: CloudColor,
  ): void {
    this.disposeMesh();

    // Half-extent in cells. Grid centered on the camera cell.
    const half = CLOUD_GRID_CELLS >> 1;
    const gridMinCellX = cellCameraX - half;
    const gridMinCellZ = cellCameraZ - half;

    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    let idx = 0;
    let filled = 0;

    // Cloud colour × directional brightness × alpha, baked per vertex.
    // Uses linear values already; the sky sphere / celestial pipeline
    // stores linear vertex colours everywhere else too.
    const topR = cloudColor.r * TOP_BRIGHTNESS;
    const topG = cloudColor.g * TOP_BRIGHTNESS;
    const topB = cloudColor.b * TOP_BRIGHTNESS;
    const sideR = cloudColor.r * SIDE_BRIGHTNESS;
    const sideG = cloudColor.g * SIDE_BRIGHTNESS;
    const sideB = cloudColor.b * SIDE_BRIGHTNESS;
    const botR = cloudColor.r * BOTTOM_BRIGHTNESS;
    const botG = cloudColor.g * BOTTOM_BRIGHTNESS;
    const botB = cloudColor.b * BOTTOM_BRIGHTNESS;

    // Helper: read cell occupancy from the tiling 256×256 texture.
    const cellFilled = (cellX: number, cellZ: number): boolean => {
      // Positive modulo (JS % is sign-preserving).
      const tx = ((cellX % CLOUD_TEXTURE_SIZE) + CLOUD_TEXTURE_SIZE) % CLOUD_TEXTURE_SIZE;
      const tz = ((cellZ % CLOUD_TEXTURE_SIZE) + CLOUD_TEXTURE_SIZE) % CLOUD_TEXTURE_SIZE;
      return this.occupancy[tz * CLOUD_TEXTURE_SIZE + tx]! !== 0;
    };

    // World Y in local coordinates. Root group's Y stays at 0.
    const y0 = CLOUD_BOTTOM_Y;
    const y1 = CLOUD_TOP_Y;
    const s = CLOUD_CELL_SIZE;

    for (let gz = 0; gz < CLOUD_GRID_CELLS; gz++) {
      const worldCellZ = gridMinCellZ + gz;
      const zMin = gz * s;
      const zMax = zMin + s;
      for (let gx = 0; gx < CLOUD_GRID_CELLS; gx++) {
        const worldCellX = gridMinCellX + gx;
        if (!cellFilled(worldCellX, worldCellZ)) continue;
        filled++;
        const xMin = gx * s;
        const xMax = xMin + s;

        // Neighbour occupancy for internal-face culling. Neighbours off
        // the visible grid edge are treated as "empty" so edge faces
        // draw (which is what we want — the layer feels bounded past
        // the horizon fog).
        const nPosX = cellFilled(worldCellX + 1, worldCellZ);
        const nNegX = cellFilled(worldCellX - 1, worldCellZ);
        const nPosZ = cellFilled(worldCellX, worldCellZ + 1);
        const nNegZ = cellFilled(worldCellX, worldCellZ - 1);
        // Top and bottom neighbours are always empty (single-layer clouds).
        const nPosY = false;
        const nNegY = false;

        if (!nPosY) {
          const start = idx;
          positions.push(xMin, y1, zMin, xMax, y1, zMin, xMax, y1, zMax, xMin, y1, zMax);
          for (let v = 0; v < 4; v++) colors.push(topR, topG, topB, CLOUD_ALPHA);
          indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
          idx += 4;
        }
        if (!nNegY) {
          const start = idx;
          positions.push(xMin, y0, zMax, xMax, y0, zMax, xMax, y0, zMin, xMin, y0, zMin);
          for (let v = 0; v < 4; v++) colors.push(botR, botG, botB, CLOUD_ALPHA);
          indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
          idx += 4;
        }
        if (!nPosX) {
          const start = idx;
          positions.push(xMax, y0, zMin, xMax, y1, zMin, xMax, y1, zMax, xMax, y0, zMax);
          for (let v = 0; v < 4; v++) colors.push(sideR, sideG, sideB, CLOUD_ALPHA);
          indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
          idx += 4;
        }
        if (!nNegX) {
          const start = idx;
          positions.push(xMin, y0, zMax, xMin, y1, zMax, xMin, y1, zMin, xMin, y0, zMin);
          for (let v = 0; v < 4; v++) colors.push(sideR, sideG, sideB, CLOUD_ALPHA);
          indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
          idx += 4;
        }
        if (!nPosZ) {
          const start = idx;
          positions.push(xMax, y0, zMax, xMax, y1, zMax, xMin, y1, zMax, xMin, y0, zMax);
          for (let v = 0; v < 4; v++) colors.push(sideR, sideG, sideB, CLOUD_ALPHA);
          indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
          idx += 4;
        }
        if (!nNegZ) {
          const start = idx;
          positions.push(xMin, y0, zMin, xMin, y1, zMin, xMax, y1, zMin, xMax, y0, zMin);
          for (let v = 0; v < 4; v++) colors.push(sideR, sideG, sideB, CLOUD_ALPHA);
          indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
          idx += 4;
        }
      }
    }

    this.lastCellCountVisible = filled;

    if (positions.length === 0) {
      // No visible cloud cells in this window; nothing to draw.
      return;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    geometry.setIndex(indices);
    // Explicit bounding sphere so frustum culling never clips the mesh
    // when the camera turns around; the mesh position is set to the
    // cell-snapped origin each frame.
    geometry.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(CLOUD_GRID_EXTENT / 2, CLOUD_BOTTOM_Y + 2, CLOUD_GRID_EXTENT / 2),
      CLOUD_GRID_EXTENT,
    );

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = 'clouds';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = CLOUD_RENDER_ORDER;
    // Record the base cloud colour the geometry was baked with, so the
    // next-frame updateVertexColors call can rescale by the ratio.
    this.mesh.userData.cloudColorR = cloudColor.r;
    this.mesh.userData.cloudColorG = cloudColor.g;
    this.mesh.userData.cloudColorB = cloudColor.b;
    this.root.add(this.mesh);
  }

  /**
   * Rescale the per-vertex cloud colour to match the new frame's cloud
   * colour, preserving each face's directional brightness (baked as
   * base × {1.0, 0.9, 0.7} in the RGB channels; alpha is a constant).
   *
   * Cost: 4 floats × vertex count. Runs every frame the camera stays
   * inside the same cell (i.e. most frames); still trivial for ~48²
   * cells worth of face vertices.
   *
   * Uses userData-recorded old base colour set by rebuildGeometry.
   */
  private updateVertexColors(cloudColor: CloudColor): void {
    if (this.mesh === null) return;
    const attr = this.mesh.geometry.getAttribute('color') as THREE.BufferAttribute | undefined;
    if (attr === undefined) return;

    const oldR = (this.mesh.userData.cloudColorR as number | undefined) ?? cloudColor.r;
    const oldG = (this.mesh.userData.cloudColorG as number | undefined) ?? cloudColor.g;
    const oldB = (this.mesh.userData.cloudColorB as number | undefined) ?? cloudColor.b;

    // Avoid division blowup when a channel hits zero (midnight R,G≈0.1).
    // A tiny epsilon is fine because at very small base values the vertex
    // colour is dominated by the near-zero factor.
    const safeR = Math.abs(oldR) < 1e-6 ? 1e-6 : oldR;
    const safeG = Math.abs(oldG) < 1e-6 ? 1e-6 : oldG;
    const safeB = Math.abs(oldB) < 1e-6 ? 1e-6 : oldB;

    const scaleR = cloudColor.r / safeR;
    const scaleG = cloudColor.g / safeG;
    const scaleB = cloudColor.b / safeB;

    // Fast path: no change (common when the sky colour is stable for
    // many frames at midday / midnight).
    if (
      Math.abs(scaleR - 1) < 1e-4 &&
      Math.abs(scaleG - 1) < 1e-4 &&
      Math.abs(scaleB - 1) < 1e-4
    ) {
      return;
    }

    const array = attr.array as Float32Array;
    const vertexCount = attr.count;
    for (let i = 0; i < vertexCount; i++) {
      array[i * 4] = array[i * 4]! * scaleR;
      array[i * 4 + 1] = array[i * 4 + 1]! * scaleG;
      array[i * 4 + 2] = array[i * 4 + 2]! * scaleB;
      // Alpha unchanged.
    }
    attr.needsUpdate = true;

    this.mesh.userData.cloudColorR = cloudColor.r;
    this.mesh.userData.cloudColorG = cloudColor.g;
    this.mesh.userData.cloudColorB = cloudColor.b;
  }

  private disposeMesh(): void {
    if (this.mesh === null) return;
    this.mesh.geometry.dispose();
    this.mesh.removeFromParent();
    this.mesh = null;
  }
}
