import * as THREE from 'three';
import type { ChunkManager } from '../../world/ChunkManager';
import type { BlockRegistry } from '../../blocks/BlockRegistry';
import { BlockIds } from '../../blocks/BlockId';
import { CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z } from '../../world/chunkConstants';
import { ClimateSampler } from '../../world/generation/climate/ClimateSampler';
import { selectBiome } from '../../world/generation/climate/BiomeSelector';
import type { BiomeId } from '../../world/generation/climate/biomes';
import type { AtmosphericState } from '../AtmosphericState';
import { blockIdBlocksWeather } from '../../world/weather/WeatherBlocking';
import { fluidSurfaceHeight } from '../../world/fluid/FluidMetadata';
import { getBetaFluidCornerHeight } from '../fluid/FluidSurfaceGeometry';

/**
 * Beta-style batched precipitation renderer (Rain + Snow).
 *
 * Geometry
 * --------
 * Two orthogonal quad planes per column (a Z-facing plane at x+0.5 and
 * an X-facing plane at z+0.5), matching Beta `renderRainSnow`. Emits
 * only for columns where the biome allows precipitation and the
 * column's top-solid block leaves visible vertical band around the
 * camera.
 *
 * The Beta radius (Q1) is exposed as `WEATHER_RENDER_RADIUS`; default
 * is 10 (Fancy graphics). A future Fast-graphics option only needs to
 * change this constant.
 *
 * Rebuild triggers:
 *   - Camera crosses an integer world-block boundary in X or Z.
 *   - Weather transitions between rain, snow, and mixed regions.
 *   - Any chunk in the visible column set becomes dirty (block break /
 *     place). We poll `chunk.isDirty()` cheaply once per frame; the
 *     column set is at most `(2*R+1)^2 / 16` chunks, so trivially fast.
 *
 * Material
 * --------
 * One BufferGeometry, TWO materials (one per texture: rain, snow).
 * Both `transparent:true, blending:NormalBlending, depthTest:true,
 * depthWrite:false, fog:false` (fog would collapse the tight 21×21
 * cylinder). NearestFilter + RepeatWrapping so the texture wraps
 * seamlessly as UVs scroll downward. Vertex-color alpha channel carries
 * the per-column edge fade (Beta `(1 - dist²/R²) * 0.5 + 0.5`) plus the
 * weather-strength multiplier.
 *
 * Column determinism
 * ------------------
 * Beta seeds a per-column RNG (`k1*k1*3121 + k1*45700027 + i2*i2*418711
 * + i2*13761`) to produce a stable per-column UV offset. Ported bit-for-
 * bit so a moving player never sees columns "shimmer".
 */

import type { WorldTime } from '../../world/WorldTime';

export const WEATHER_RENDER_RADIUS_FAST = 5;
export const WEATHER_RENDER_RADIUS_FANCY = 10;
/** Back-compat export: fancy radius, matching Beta's default fancy setting. */
export const WEATHER_RENDER_RADIUS = WEATHER_RENDER_RADIUS_FANCY;

/**
 * Rain texture V-scroll rate — full-texture loops per real-time second.
 *
 * Stage 18B: 4.0 was way too fast (looked like textured noise). At 1.5
 * with the rain texture repeating every 4 vertical world blocks
 * (V = y/4 in the shader), texels descend the visible sheet at
 * 4 blocks × 1.5 loops/s = 6 blocks/s — Beta-ish.
 */
export const RAIN_SCROLL_SPEED = 1.5;

/** Snow V-scroll rate. Stays much slower than rain. */
export const SNOW_SCROLL_SPEED = 0.4;
/** Snow horizontal sway amplitude in UV units. */
const SNOW_SWAY_AMPLITUDE = 0.02;
const SNOW_SWAY_FREQUENCY = 0.4; // Hz

/**
 * Rain slant per unit of vertical extent. When the top of a quad sits
 * H world blocks above the bottom, the top is shifted horizontally by
 * `RAIN_SLANT_X * H` (world X) and `RAIN_SLANT_Z * H` (world Z) — so a
 * rain sheet visibly leans in the wind direction from any camera angle.
 *
 * Defaults come from AtmosphericState.WIND_X / WIND_Z (imported below).
 * Rendered constants are exported so future weather-strength scaling
 * can bump the slant during storms without touching the geometry code.
 */
export const RAIN_SLANT_X = -0.35;
export const RAIN_SLANT_Z = 0.0;
/**
 * How much horizontal drift is added to the UV scroll direction to
 * match the geometric slant. Small — the texels should visibly travel
 * down-and-slightly-sideways along the tilted sheet, not far enough
 * horizontally to make the pattern shear obvious.
 */
const RAIN_UV_HORIZONTAL_DRIFT = 0.05; // U units per V loop, in wind sign

/** Tiny lift above the weather-blocking top face to avoid water-surface precision bleed. */
const PRECIPITATION_SURFACE_EPSILON = 0.01;

/** Precipitation categories per column. */
type PrecipKind = 'none' | 'rain' | 'snow';

/**
 * Beta biome → precipitation kind.
 *
 * Beta uses two orthogonal booleans on BiomeGenBase (`getEnableSnow`
 * and `canSpawnLightningBolt`); the renderer runs two loops, one for
 * each. In our project we don't model those booleans separately —
 * instead we look up our BiomeId directly. The mapping is:
 *
 *   Tundra, Taiga        → snow  (getEnableSnow)
 *   Desert, Savanna      → none  (dry biomes; Beta skips these)
 *   Everything else      → rain
 */
function biomeToPrecip(biome: BiomeId): PrecipKind {
  switch (biome) {
    case 'tundra':
    case 'taiga':
      return 'snow';
    case 'desert':
    case 'savanna':
      return 'none';
    default:
      return 'rain';
  }
}

/** Per-column baked info. */
interface ColumnInfo {
  worldX: number;
  worldZ: number;
  kind: PrecipKind;
  topY: number;
  edgeFade: number; // 0..1 — 1 at centre, ~0.5 at edge (Beta formula)
  columnSeed: number;
}

export class PrecipitationRenderer {
  private readonly root: THREE.Group;
  private readonly rainMaterial: THREE.MeshBasicMaterial;
  private readonly snowMaterial: THREE.MeshBasicMaterial;
  private readonly rainMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly snowMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly climateSampler: ClimateSampler;
  private readonly chunkManager: ChunkManager;
  private readonly blockRegistry: BlockRegistry;
  private readonly isFancyGraphicsEnabled: () => boolean;

  private lastCameraCellX = Number.NaN;
  private lastCameraCellY = Number.NaN;
  private lastCameraCellZ = Number.NaN;
  private lastRenderRadius = Number.NaN;
  private lastRainOn = false;
  private readonly sampledWeatherRevisions = new Map<string, number>();

  private columns: ColumnInfo[] = [];
  private rainingColumns: ColumnInfo[] = [];
  private scrollT = 0; // accumulated seconds — drives UV scroll

  private rainActiveCount = 0;
  private snowActiveCount = 0;
  private lastBuildMs = 0;
  private lastUpdateMs = 0;
  private lastVertexCount = 0;
  private lastIndexCount = 0;

  public constructor(
    scene: THREE.Scene,
    chunkManager: ChunkManager,
    climateSampler: ClimateSampler,
    blockRegistry: BlockRegistry,
    isFancyGraphicsEnabled: () => boolean,
  ) {
    this.chunkManager = chunkManager;
    this.climateSampler = climateSampler;
    this.blockRegistry = blockRegistry;
    this.isFancyGraphicsEnabled = isFancyGraphicsEnabled;

    this.root = new THREE.Group();
    this.root.name = 'precipitationLayer';
    this.root.frustumCulled = false;
    // Task requires precipitation to be occluded by transparent depth pre-pass.
    // Final order: 0 opaque, 10 cutout, 19 depth pre-pass (water/lava/ice/glass), 20-22 colour, 25 fire, 30 rain/snow
    this.root.renderOrder = 30;
    scene.add(this.root);

    const loader = new THREE.TextureLoader();
    const rainTex = loader.load('/textures/environment/rain.png', configureCrispTiling);
    configureCrispTiling(rainTex);
    const snowTex = loader.load('/textures/environment/snow.png', configureCrispTiling);
    configureCrispTiling(snowTex);

    this.rainMaterial = new THREE.MeshBasicMaterial({
      map: rainTex,
      transparent: true,
      opacity: 1,
      depthTest: true,
      depthWrite: false,
      fog: true,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      vertexColors: true,
      toneMapped: false,
    });
    this.snowMaterial = new THREE.MeshBasicMaterial({
      map: snowTex,
      transparent: true,
      opacity: 1,
      depthTest: true,
      depthWrite: false,
      fog: true,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      vertexColors: true,
      toneMapped: false,
    });

    this.rainMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.rainMaterial);
    this.rainMesh.name = 'rainSheets';
    this.rainMesh.renderOrder = 30;
    this.rainMesh.frustumCulled = false;
    this.rainMesh.visible = false;
    this.root.add(this.rainMesh);

    this.snowMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.snowMaterial);
    this.snowMesh.name = 'snowSheets';
    this.snowMesh.renderOrder = 30;
    this.snowMesh.frustumCulled = false;
    this.snowMesh.visible = false;
    this.root.add(this.snowMesh);
  }

  public update(
    cameraX: number,
    cameraY: number,
    cameraZ: number,
    deltaSeconds: number,
    atmos: AtmosphericState,
    _worldTime: WorldTime,
  ): void {
    void _worldTime; // future: could drive lightning-flicker sync if needed
    const updateStart = performance.now();
    this.scrollT += deltaSeconds;

    const rainOn = atmos.rainStrength > 0.001;
    if (!rainOn) {
      this.rainMesh.visible = false;
      this.snowMesh.visible = false;
      this.lastUpdateMs = performance.now() - updateStart;
      return;
    }

    // Rebuild geometry only when the camera crosses a cell boundary,
    // vertical storm band changes, rain toggles, or sampled weather-blocking
    // height data changes. Mesh dirty state alone must not trigger rain rebuilds.
    const cx = Math.floor(cameraX);
    const cy = Math.floor(cameraY);
    const cz = Math.floor(cameraZ);
    const renderRadius = this.getRenderRadius();
    if (
      cx !== this.lastCameraCellX ||
      cy !== this.lastCameraCellY ||
      cz !== this.lastCameraCellZ ||
      renderRadius !== this.lastRenderRadius ||
      rainOn !== this.lastRainOn ||
      this.needsHeightmapResample()
    ) {
      this.rebuildColumns(cx, cameraY, cz);
      this.rebuildGeometry(cx, cameraY, cz, atmos);
      this.lastCameraCellX = cx;
      this.lastCameraCellY = cy;
      this.lastCameraCellZ = cz;
      this.lastRenderRadius = renderRadius;
      this.lastRainOn = rainOn;
      // snowActiveCount is tracked purely so `getStats()` can report it;
      // no need to store lastSnowOn separately.
    } else {
      // Per-frame update: refresh vertex-color alpha for weather strength
      // and material texture-offset for scrolling animation.
      this.updateVertexAlphaFromStrength(atmos);
    }

    // Root follows the camera by translation only (no rotation).
    this.root.position.set(0, 0, 0);

    // Rain: fast downward scroll. Quad V increases with world Y
    // (`v = y / 4`), and Three's positive texture offset adds to sampled
    // V; therefore a positive V offset moves texture features downward
    // in world space, matching Beta's `v + f10` renderRainSnow math.
    const rainV = (this.scrollT * RAIN_SCROLL_SPEED) % 1;
    const rainU = (Math.sign(RAIN_SLANT_X) * this.scrollT * RAIN_SCROLL_SPEED * RAIN_UV_HORIZONTAL_DRIFT) % 1;
    (this.rainMaterial.map as THREE.Texture).offset.set(rainU, rainV);
    // Snow: same V convention as rain, but slower and with horizontal sway.
    const snowV = (this.scrollT * SNOW_SCROLL_SPEED) % 1;
    const snowU =
      Math.sin(this.scrollT * SNOW_SWAY_FREQUENCY * 2 * Math.PI) * SNOW_SWAY_AMPLITUDE;
    (this.snowMaterial.map as THREE.Texture).offset.set(snowU, snowV);

    this.rainMesh.visible = this.rainActiveCount > 0;
    this.snowMesh.visible = this.snowActiveCount > 0;
    this.lastUpdateMs = performance.now() - updateStart;
  }

  /** Splash renderer needs to know where rain actually lands. */
  public getRainingColumns(): readonly ColumnInfo[] {
    return this.rainingColumns;
  }

  public getStats(): { rain: number; snow: number; total: number; buildMs: number; updateMs: number; vertices: number; indices: number } {
    return {
      rain: this.rainActiveCount,
      snow: this.snowActiveCount,
      total: this.columns.length,
      buildMs: this.lastBuildMs,
      updateMs: this.lastUpdateMs,
      vertices: this.lastVertexCount,
      indices: this.lastIndexCount,
    };
  }

  public getRenderRadius(): number {
    return this.isFancyGraphicsEnabled()
      ? WEATHER_RENDER_RADIUS_FANCY
      : WEATHER_RENDER_RADIUS_FAST;
  }

  public dispose(): void {
    this.rainMesh.geometry.dispose();
    this.snowMesh.geometry.dispose();
    this.rainMaterial.map?.dispose();
    this.snowMaterial.map?.dispose();
    this.rainMaterial.dispose();
    this.snowMaterial.dispose();
    this.root.removeFromParent();
  }

  // ---------------------------------------------------------------------------
  // Column sampling
  // ---------------------------------------------------------------------------

  private rebuildColumns(cameraCellX: number, cameraY: number, cameraCellZ: number): void {
    const R = this.getRenderRadius();
    const eyeBlockY = Math.floor(cameraY);
    const columns: ColumnInfo[] = [];
    this.sampledWeatherRevisions.clear();

    const climates = this.climateSampler.sampleRegion(
      cameraCellX - R,
      cameraCellZ - R,
      2 * R + 1,
      2 * R + 1,
    );

    let index = 0;
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        const wx = cameraCellX + dx;
        const wz = cameraCellZ + dz;
        const climate = climates[index++]!;
        const biome = selectBiome(climate);
        const kind = biomeToPrecip(biome.id);
        if (kind === 'none') continue;

        const distX = dx;
        const distZ = dz;
        const distFrac = Math.sqrt(distX * distX + distZ * distZ) / R;
        if (distFrac > 1) continue;
        const betaEdgeFade = (1 - distFrac * distFrac) * 0.5 + 0.5;
        const outerFade = distFrac < 0.85 ? 1 : Math.max(0, (1 - distFrac) / 0.15);
        const edgeFade = betaEdgeFade * outerFade;

        // Top blocking surface — must account for Ice, Glass, Water, Lava, Leaves etc.
        // Previously used only highest opaque block; now uses precipitation heightmap which includes
        // all blocksWeather (Ice, Glass, Water, Lava) and for fluids uses rendered surface height.
        const topY = this.getTopBlockingSurfaceY(wx, wz);
        const bandTop = eyeBlockY + R;
        if (topY >= bandTop) continue;

        columns.push({
          worldX: wx,
          worldZ: wz,
          kind,
          topY,
          edgeFade,
          columnSeed: hashColumnSeed(wx, wz),
        });
      }
    }

    this.columns = columns;
    this.rainingColumns = columns.filter((c) => c.kind === 'rain');
    this.rainActiveCount = this.rainingColumns.length;
    this.snowActiveCount = columns.length - this.rainActiveCount;
  }

  private needsHeightmapResample(): boolean {
    for (const [key, revision] of this.sampledWeatherRevisions) {
      const comma = key.indexOf(',');
      const chunkX = Number(key.slice(0, comma));
      const chunkZ = Number(key.slice(comma + 1));
      const chunk = this.chunkManager.getChunk(chunkX, chunkZ);
      if (chunk === undefined || chunk.getWeatherRevision() !== revision) {
        return true;
      }
    }
    return false;
  }

  /**
   * Returns the Y of the topmost weather-blocking surface in this column.
   * Accounts for:
   * - opaque full cubes (Stone, Dirt)
   * - Ice, Glass (full translucent)
   * - Water/Lava surfaces (uses rendered fluid surface height, not integer top)
   * - Leaves etc (blocksWeather true)
   * If no blocking block, returns CHUNK_SIZE_Y.
   */
  private getTopBlockingSurfaceY(worldX: number, worldZ: number): number {
    const chunkX = Math.floor(worldX / CHUNK_SIZE_X);
    const chunkZ = Math.floor(worldZ / CHUNK_SIZE_Z);
    const chunk = this.chunkManager.getChunk(chunkX, chunkZ);
    if (chunk === undefined) return CHUNK_SIZE_Y;
    this.sampledWeatherRevisions.set(`${chunkX},${chunkZ}`, chunk.getWeatherRevision());
    const localX = ((worldX % CHUNK_SIZE_X) + CHUNK_SIZE_X) % CHUNK_SIZE_X;
    const localZ = ((worldZ % CHUNK_SIZE_Z) + CHUNK_SIZE_Z) % CHUNK_SIZE_Z;

    const precipHeight = chunk.getPrecipitationHeight(
      localX,
      localZ,
      (blockId) => blockIdBlocksWeather(this.blockRegistry, blockId),
    );

    if (precipHeight < 0) return CHUNK_SIZE_Y;

    // precipHeight is one past blocking block (air above). Blocking block Y = precipHeight -1
    const blockingY = precipHeight - 1;
    if (blockingY < 0) return CHUNK_SIZE_Y;

    const blockId = chunk.getBlock(localX, blockingY, localZ);

    // For fluids, use rendered surface height (sloped) rather than integer top
    if (blockId === BlockIds.WaterFlowing || blockId === BlockIds.WaterStill || blockId === BlockIds.LavaFlowing || blockId === BlockIds.LavaStill) {
      return this.getFluidSurfaceY(worldX, blockingY, worldZ, blockId);
    }

    // For Ice, Glass, and other full blocks, top surface is blockingY+1
    // For partial blocks (e.g., leaves are full), same.
    return blockingY + 1;
  }

  /**
   * Computes fluid surface Y for a fluid block at (worldX, y, worldZ).
   * Uses Beta corner height sampling (same as mesher) to get sloped surface,
   * then returns y + average corner height.
   * Falls back to fluidSurfaceHeight(metadata) if corner sampling fails.
   */
  private getFluidSurfaceY(worldX: number, blockY: number, worldZ: number, fluidBlockId: number): number {
    const chunkX = Math.floor(worldX / CHUNK_SIZE_X);
    const chunkZ = Math.floor(worldZ / CHUNK_SIZE_Z);
    const localX = ((worldX % CHUNK_SIZE_X) + CHUNK_SIZE_X) % CHUNK_SIZE_X;
    const localZ = ((worldZ % CHUNK_SIZE_Z) + CHUNK_SIZE_Z) % CHUNK_SIZE_Z;
    const chunk = this.chunkManager.getChunk(chunkX, chunkZ);
    if (chunk === undefined) return blockY + 1;

    const metadata = chunk.getBlockMetadata(localX, blockY, localZ);

    // If source or full, return full height quickly
    const h00 = this.sampleFluidCornerHeight(worldX, blockY, worldZ, fluidBlockId, 0, 0);
    const h10 = this.sampleFluidCornerHeight(worldX, blockY, worldZ, fluidBlockId, 1, 0);
    const h11 = this.sampleFluidCornerHeight(worldX, blockY, worldZ, fluidBlockId, 1, 1);
    const h01 = this.sampleFluidCornerHeight(worldX, blockY, worldZ, fluidBlockId, 0, 1);

    const avg = (h00 + h10 + h11 + h01) / 4;
    // Clamp to reasonable range (0..1)
    const clamped = Math.max(0, Math.min(1, avg));
    // If flat metadata fallback gives different, use max of both to avoid rain inside fluid
    const flat = fluidSurfaceHeight(metadata);
    return blockY + Math.max(clamped, flat);
  }

  private sampleFluidCornerHeight(worldX: number, blockY: number, worldZ: number, fluidBlockId: number, dx: number, dz: number): number {
    const cornerX = dx === 0 ? worldX : worldX + 1;
    const cornerZ = dz === 0 ? worldZ : worldZ + 1;

    // Accessor for getBetaFluidCornerHeight — samples 4 blocks around corner
    const isSameFluid = (a: number, b: number): boolean => {
      const waterA = a === BlockIds.WaterFlowing || a === BlockIds.WaterStill;
      const waterB = b === BlockIds.WaterFlowing || b === BlockIds.WaterStill;
      const lavaA = a === BlockIds.LavaFlowing || a === BlockIds.LavaStill;
      const lavaB = b === BlockIds.LavaFlowing || b === BlockIds.LavaStill;
      return (waterA && waterB) || (lavaA && lavaB);
    };

    const getBlock = (x: number, y: number, z: number): number => {
      if (y < 0 || y >= CHUNK_SIZE_Y) return 0;
      const cx = Math.floor(x / CHUNK_SIZE_X);
      const cz = Math.floor(z / CHUNK_SIZE_Z);
      const ch = this.chunkManager.getChunk(cx, cz);
      if (ch === undefined) return 0;
      const lx = ((x % CHUNK_SIZE_X) + CHUNK_SIZE_X) % CHUNK_SIZE_X;
      const lz = ((z % CHUNK_SIZE_Z) + CHUNK_SIZE_Z) % CHUNK_SIZE_Z;
      return ch.getBlock(lx, y, lz);
    };

    const getMetadata = (x: number, y: number, z: number): number => {
      if (y < 0 || y >= CHUNK_SIZE_Y) return 0;
      const cx = Math.floor(x / CHUNK_SIZE_X);
      const cz = Math.floor(z / CHUNK_SIZE_Z);
      const ch = this.chunkManager.getChunk(cx, cz);
      if (ch === undefined) return 0;
      const lx = ((x % CHUNK_SIZE_X) + CHUNK_SIZE_X) % CHUNK_SIZE_X;
      const lz = ((z % CHUNK_SIZE_Z) + CHUNK_SIZE_Z) % CHUNK_SIZE_Z;
      return ch.getBlockMetadata(lx, y, lz);
    };

    const isSolidForFluidHeight = (id: number): boolean => {
      const def = this.blockRegistry.getById(id);
      return def !== undefined && def.solid && def.renderType !== 'leaves';
    };

    return getBetaFluidCornerHeight(
      {
        getBlock,
        getMetadata,
        isSameFluid,
        isSolidForFluidHeight,
      },
      cornerX,
      blockY,
      cornerZ,
      fluidBlockId,
    );
  }

  // ---------------------------------------------------------------------------
  // Geometry
  // ---------------------------------------------------------------------------

  private rebuildGeometry(
    cx: number,
    cameraY: number,
    cz: number,
    atmos: AtmosphericState,
  ): void {
    const buildStart = performance.now();
    // Two orthogonal quads per column, one per material. Emit separate
    // arrays for rain vs snow so we can bind different textures.
    const rain: BuildBuffers = new BuildBuffers();
    const snow: BuildBuffers = new BuildBuffers();

    const eyeBlockY = Math.floor(cameraY);
    const R = this.getRenderRadius();

    for (const col of this.columns) {
      const bandBottom = Math.max(col.topY + PRECIPITATION_SURFACE_EPSILON, eyeBlockY - R);
      const bandTop = Math.max(col.topY + PRECIPITATION_SURFACE_EPSILON, eyeBlockY + R);
      if (bandBottom >= bandTop) continue;

      const buffers = col.kind === 'rain' ? rain : snow;

      // Beta seeds a per-column offset into UV space.
      const seedRand = new SmallXorRandom(col.columnSeed);
      const uOffset = seedRand.nextFloat();

      // Column-local relative positions: the mesh root sits at origin
      // (in world space we don't translate the root; per-vertex world
      // coords are baked so terrain depth-test works correctly).
      const x0 = col.worldX;
      const x1 = col.worldX + 1;
      const z0 = col.worldZ;
      const z1 = col.worldZ + 1;
      const y0 = bandBottom;
      const y1 = bandTop;

      // Baseline vertex colour = white × edge-fade. Alpha holds the
      // multiplier that gets scaled by rain strength per-frame.
      const a = col.edgeFade;
      const r = 1;
      const g = 1;
      const b = 1;

      // Stage 18B: geometric slant. Top vertices offset by
      // `SLANT × verticalExtent` in world XZ so the sheet leans in
      // the wind direction (visible as a real slant from any camera
      // angle, not just a UV skew).
      const H = y1 - y0;
      const isRain = col.kind === 'rain';
      const slantX = isRain ? RAIN_SLANT_X * H : 0;
      const slantZ = isRain ? RAIN_SLANT_Z * H : 0;

      // Plane 1: constant z = zMid, spans X..X+1 × y0..y1.
      const zMid = col.worldZ + 0.5;
      const uSpan = 1; // full U range across the quad
      // V range: quads are tall; Beta uses `y/4` for the V coord so the
      // texture repeats every 4 blocks vertically. Match.
      const v0 = y0 / 4;
      const v1 = y1 / 4;
      buffers.addQuad(
        x0,          y0, zMid,          uOffset,          v0,
        x1,          y0, zMid,          uOffset + uSpan,  v0,
        x1 + slantX, y1, zMid + slantZ, uOffset + uSpan,  v1,
        x0 + slantX, y1, zMid + slantZ, uOffset,          v1,
        r, g, b, a,
      );

      // Plane 2: constant x = xMid, spans Z..Z+1 × y0..y1.
      const xMid = col.worldX + 0.5;
      buffers.addQuad(
        xMid,          y0, z0,          uOffset,          v0,
        xMid,          y0, z1,          uOffset + uSpan,  v0,
        xMid + slantX, y1, z1 + slantZ, uOffset + uSpan,  v1,
        xMid + slantX, y1, z0 + slantZ, uOffset,          v1,
        r, g, b, a,
      );
    }

    swapGeometry(this.rainMesh, rain);
    swapGeometry(this.snowMesh, snow);
    this.lastVertexCount = rain.positions.length / 3 + snow.positions.length / 3;
    this.lastIndexCount = rain.indices.length + snow.indices.length;
    this.lastBuildMs = performance.now() - buildStart;
    // First-frame vertex-alpha scale by weather strength.
    this.updateVertexAlphaFromStrength(atmos);
    void cx; void cz;
  }

  private updateVertexAlphaFromStrength(atmos: AtmosphericState): void {
    // Per-frame: multiply baseline vertex-alpha by rain strength.
    // Vertex baseline is stored on `.userData.baselineAlpha` per mesh
    // so the multiplication is idempotent (we don't compound).
    scaleAlphaFromBaseline(this.rainMesh, atmos.rainStrength);
    scaleAlphaFromBaseline(this.snowMesh, atmos.rainStrength);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function configureCrispTiling(texture: THREE.Texture): void {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
}

/**
 * Beta's per-column hash (World::renderRainSnow):
 *   seed = x*x*3121 + x*45700027 + z*z*418711 + z*13761
 * Values may overflow Java's signed 32-bit int; we take (n | 0) to
 * mirror that wrap so column offsets match Beta exactly.
 */
function hashColumnSeed(x: number, z: number): number {
  const a = Math.imul(Math.imul(x, x), 3121);
  const b = Math.imul(x, 45700027 | 0);
  const c = Math.imul(Math.imul(z, z), 418711);
  const d = Math.imul(z, 13761);
  return (a + b + c + d) | 0;
}

class SmallXorRandom {
  private state: number;
  public constructor(seed: number) {
    this.state = (seed | 0) || 1;
  }
  public nextFloat(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x | 0;
    return ((x >>> 0) % 65536) / 65536;
  }
}

class BuildBuffers {
  public positions: number[] = [];
  public uvs: number[] = [];
  public colors: number[] = [];
  public indices: number[] = [];
  private baseIndex = 0;

  public addQuad(
    x0: number, y0: number, z0: number, u0: number, v0: number,
    x1: number, y1: number, z1: number, u1: number, v1: number,
    x2: number, y2: number, z2: number, u2: number, v2: number,
    x3: number, y3: number, z3: number, u3: number, v3: number,
    r: number, g: number, b: number, a: number,
  ): void {
    this.positions.push(x0, y0, z0, x1, y1, z1, x2, y2, z2, x3, y3, z3);
    this.uvs.push(u0, v0, u1, v1, u2, v2, u3, v3);
    for (let k = 0; k < 4; k++) this.colors.push(r, g, b, a);
    const b0 = this.baseIndex;
    this.indices.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3);
    this.baseIndex += 4;
  }
}

function swapGeometry(mesh: THREE.Mesh, buffers: BuildBuffers): void {
  mesh.geometry.dispose();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(buffers.positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(buffers.uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(buffers.colors, 4));
  geo.setIndex(buffers.indices);
  // Never cull; the mesh is at world coordinates and always near the camera.
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  mesh.geometry = geo;
  // Keep a copy of baseline alphas for per-frame scaling.
  const alphas = new Float32Array(buffers.colors.length / 4);
  for (let i = 0, j = 3; i < alphas.length; i++, j += 4) alphas[i] = buffers.colors[j]!;
  mesh.userData.baselineAlpha = alphas;
  (mesh.material as THREE.Material).needsUpdate = true;
}

function scaleAlphaFromBaseline(mesh: THREE.Mesh, strength: number): void {
  const baseline = mesh.userData.baselineAlpha as Float32Array | undefined;
  if (baseline === undefined) return;
  const attr = mesh.geometry.getAttribute('color') as THREE.BufferAttribute | undefined;
  if (attr === undefined) return;
  const arr = attr.array as Float32Array;
  const n = baseline.length;
  const clamped = strength < 0 ? 0 : strength > 1 ? 1 : strength;
  for (let i = 0; i < n; i++) {
    arr[i * 4 + 3] = baseline[i]! * clamped;
  }
  attr.needsUpdate = true;
}
