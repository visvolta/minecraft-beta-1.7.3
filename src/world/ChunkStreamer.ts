import type { ChunkRenderer } from '../rendering/ChunkRenderer';
import type { ChunkManager } from './ChunkManager';
import type { Chunk } from './Chunk';
import type { WorldGenerator } from './WorldGenerator';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from './chunkConstants';
import { chunkKey } from './chunkKey';
import type { LightEngine } from './generation/lighting/LightEngine';
import { ChunkGenerationQueue, type ChunkGenerationStats } from './streaming/ChunkGenerationQueue';
import type { WorldPersistenceService } from '../persistence2/WorldPersistenceService';
import { RecordCorruptionError } from '../persistence2/codec/PersistenceError';

/** A completed chunk result waiting to be adopted under the frame budget. */
interface PendingIntegration {
  readonly chunk: Chunk;
  /** Already-resident managed chunk for persisted reads; undefined for generated. */
  readonly persisted: boolean;
  readonly trustLighting: boolean;
  readonly readyAtMs: number;
}

export interface ChunkIntegrationStats {
  readonly lastIntegrationMs: number;
  readonly lastGeneratedIntegrationMs: number;
  readonly lastReadIntegrationMs: number;
  readonly integratedChunks: number;
  readonly lastLightingInitMs: number;
  readonly lastBorderReconcileMs: number;
  readonly lastNeighbourDirtyCount: number;
  /** Results completed but not yet adopted, under the frame budget. */
  readonly pendingIntegrations: number;
  /** Generation/read completion -> visible adoption latency for the last chunk. */
  readonly lastIntegrationLatencyMs: number;
}

/** Chebyshev radius (square) for loading chunks around the camera. */
export const CHUNK_LOAD_RADIUS = 6;

/** Unload when farther than this (hysteresis vs load radius). */
export const CHUNK_UNLOAD_RADIUS = CHUNK_LOAD_RADIUS + 1;

/**
 * Frame budget for adopting completed chunk results (generated or persisted).
 *
 * Worker results used to be drained and fully integrated in one go, so a burst
 * of completions ran an unbounded number of full lighting initialisations plus
 * border reconciliations inside a single frame — the classic exploration
 * hitch. Integration is now pulled from a priority queue under both a count
 * and a wall-clock budget.
 *
 * Chunks inside CRITICAL_CHUNK_RADIUS bypass the budget so the area
 * immediately around the player can never visibly fail to appear.
 */
const MAX_INTEGRATIONS_PER_FRAME = 2;
const MAX_INTEGRATION_MS_PER_FRAME = 3;

const MAX_SYNC_GENERATION_JOBS_PER_FRAME = 1;
const MAX_SYNC_GENERATION_MS_PER_FRAME = 6;
const CRITICAL_CHUNK_RADIUS = 2;
const GENERATION_BACKPRESSURE_MESH_QUEUE = 32;
const GENERATION_BACKPRESSURE_UPLOAD_QUEUE = 8;

const NEIGHBOUR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Loads and unloads chunks around the camera.
 * Does not mesh or own chunk storage.
 */
export class ChunkStreamer {
  private readonly chunkManager: ChunkManager;
  private readonly chunkRenderer: ChunkRenderer;
  private readonly lightEngine: LightEngine;
  private readonly generationQueue: ChunkGenerationQueue;
  private readonly persistence: WorldPersistenceService;
  private readonly desiredChunks = new Set<number>();
  private readonly loadingChunks = new Set<number>();

  private lastChunkX: number | null = null;
  private lastChunkZ: number | null = null;
  private lastPriorityHeadingX = Number.NaN;
  private lastPriorityHeadingZ = Number.NaN;
  private started = false;
  private disposed = false;
  /** Set when a corrupt record halts the world; stops further chunk dispatch. */
  private halted = false;
  /** Set during Save-and-Quit quiesce: stop accepting work; detach in-flight read results. */
  private quiescing = false;
  /** Accepted read settlements, tracked to settlement so a detached read can never reject unobserved. */
  private readonly activeReads = new Map<number, Promise<void>>();
  /** Accepted unload settlements; the ChunkStreamer is the single owner of unload settlement (correction 2). */
  private readonly activeUnloads = new Map<number, Promise<void>>();
  private unloadFailure: unknown = null;
  private lastIntegrationMs = 0;
  private lastGeneratedIntegrationMs = 0;
  private lastReadIntegrationMs = 0;
  private integratedChunks = 0;
  private lastLightingInitMs = 0;
  private lastBorderReconcileMs = 0;
  private lastNeighbourDirtyCount = 0;
  /** Completed results awaiting budgeted adoption, keyed by chunk. */
  private readonly pendingIntegrations = new Map<number, PendingIntegration>();
  private lastIntegrationQueueDepth = 0;
  private lastIntegrationLatencyMs = 0;
  private stalePendingIntegrations = 0;

  public constructor(
    chunkManager: ChunkManager,
    generator: WorldGenerator,
    chunkRenderer: ChunkRenderer,
    lightEngine: LightEngine,
    worldSeed: bigint,
    persistence: WorldPersistenceService,
    private readonly trustPersistedLighting = false,
    private readonly onChunkLoaded?: (chunk: Chunk) => void,
    private readonly onPersistenceError?: (error: RecordCorruptionError) => void,
  ) {
    this.chunkManager = chunkManager;
    this.chunkRenderer = chunkRenderer;
    this.lightEngine = lightEngine;
    this.persistence = persistence;
    this.generationQueue = new ChunkGenerationQueue(chunkManager, generator, worldSeed);
  }

  public dispatchCriticalLoad(chunkX: number, chunkZ: number): void {
    if (this.disposed) return;
    if (!this.chunkManager.hasChunk(chunkX, chunkZ) && !this.loadingChunks.has(chunkKey(chunkX, chunkZ))) {
      this.desiredChunks.add(chunkKey(chunkX, chunkZ));
      this.dispatchLoad(chunkX, chunkZ, -1000000, true);
    }
  }

  /**
   * Re-evaluates the loaded set when first run or when the camera chunk changes.
   */
  public update(
    cameraWorldX: number,
    cameraWorldZ: number,
    cameraYaw: number,
    movementX: number,
    movementZ: number,
    downstreamMeshQueue: number,
    downstreamUploadQueue: number,
  ): void {
    if (this.disposed || this.halted || this.quiescing) return;
    const chunkX = Math.floor(cameraWorldX / CHUNK_SIZE_X);
    const chunkZ = Math.floor(cameraWorldZ / CHUNK_SIZE_Z);

    const cameraDir = { x: -Math.sin(cameraYaw), z: -Math.cos(cameraYaw) };
    const moveLen = Math.hypot(movementX, movementZ);
    const moveDir = moveLen > 0.05 ? { x: movementX / moveLen, z: movementZ / moveLen } : null;
    const priorityHeading = moveDir ?? cameraDir;
    const headingChanged =
      Number.isNaN(this.lastPriorityHeadingX) ||
      this.lastPriorityHeadingX * priorityHeading.x + this.lastPriorityHeadingZ * priorityHeading.z < 0.95;

    if (
      !this.started ||
      chunkX !== this.lastChunkX ||
      chunkZ !== this.lastChunkZ ||
      headingChanged
    ) {
      this.streamAround(chunkX, chunkZ, cameraDir, moveDir);
      this.lastChunkX = chunkX;
      this.lastChunkZ = chunkZ;
      this.lastPriorityHeadingX = priorityHeading.x;
      this.lastPriorityHeadingZ = priorityHeading.z;
      this.started = true;
    }

    const allowNonCriticalDispatch =
      downstreamMeshQueue < GENERATION_BACKPRESSURE_MESH_QUEUE &&
      downstreamUploadQueue < GENERATION_BACKPRESSURE_UPLOAD_QUEUE;
    this.lastGeneratedIntegrationMs = 0;
    const completed = this.generationQueue.process(
      MAX_SYNC_GENERATION_JOBS_PER_FRAME,
      MAX_SYNC_GENERATION_MS_PER_FRAME,
      this.desiredChunks,
      allowNonCriticalDispatch,
    );
    for (const { chunk, lightingAdopted } of completed) {
      this.pendingIntegrations.set(chunkKey(chunk.chunkX, chunk.chunkZ), {
        chunk,
        persisted: false,
        // Worker-generated chunks already carry deterministic initial light
        // from the shared module; only border reconciliation remains.
        trustLighting: lightingAdopted,
        readyAtMs: performance.now(),
      });
    }

    this.drainPendingIntegrations(chunkX, chunkZ);
  }

  /**
   * Adopt completed chunk results under a frame budget.
   *
   * Generated and persisted results share this one pipeline, so budgeting
   * cannot be defeated by a second unbudgeted path. Ordering is by distance
   * to the camera, and chunks within CRITICAL_CHUNK_RADIUS ignore the budget
   * entirely: a high frame rate with a hole around the player is not a win.
   */
  private drainPendingIntegrations(cameraChunkX: number, cameraChunkZ: number): void {
    if (this.pendingIntegrations.size === 0) {
      this.lastIntegrationQueueDepth = 0;
      return;
    }

    const ordered = [...this.pendingIntegrations.entries()].sort((a, b) => {
      const da = Math.max(Math.abs(a[1].chunk.chunkX - cameraChunkX), Math.abs(a[1].chunk.chunkZ - cameraChunkZ));
      const db = Math.max(Math.abs(b[1].chunk.chunkX - cameraChunkX), Math.abs(b[1].chunk.chunkZ - cameraChunkZ));
      return da - db;
    });

    const start = performance.now();
    let adopted = 0;

    for (const [key, entry] of ordered) {
      const distance = Math.max(
        Math.abs(entry.chunk.chunkX - cameraChunkX),
        Math.abs(entry.chunk.chunkZ - cameraChunkZ),
      );
      const critical = distance <= CRITICAL_CHUNK_RADIUS;

      if (!critical) {
        if (adopted >= MAX_INTEGRATIONS_PER_FRAME) break;
        if (performance.now() - start >= MAX_INTEGRATION_MS_PER_FRAME) break;
      }

      this.pendingIntegrations.delete(key);

      // A chunk that left the desired set while queued is pure waste: drop it
      // rather than paying for lighting and border reconciliation.
      if (!this.desiredChunks.has(key)) {
        this.stalePendingIntegrations += 1;
        continue;
      }

      this.integrateChunk(entry);
      adopted += 1;
    }

    this.lastIntegrationQueueDepth = this.pendingIntegrations.size;
  }

  /** The single staged adoption path: light -> border reconcile -> notify. */
  private integrateChunk(entry: PendingIntegration): void {
    const chunk = entry.chunk;
    const integrationStart = performance.now();

    if (!entry.trustLighting) {
      const lightStart = performance.now();
      this.lightEngine.initializeChunkLighting(chunk);
      this.lastLightingInitMs = performance.now() - lightStart;
    }

    const borderStart = performance.now();
    this.lightEngine.reconcileChunkBorders(chunk);
    this.lastBorderReconcileMs = performance.now() - borderStart;

    this.lastNeighbourDirtyCount = this.markNeighboursDirty(chunk.chunkX, chunk.chunkZ);
    this.onChunkLoaded?.(chunk);

    const integrationMs = performance.now() - integrationStart;
    if (entry.persisted) this.lastReadIntegrationMs = integrationMs;
    else this.lastGeneratedIntegrationMs += integrationMs;
    this.lastIntegrationMs = integrationMs;
    this.lastIntegrationLatencyMs = performance.now() - entry.readyAtMs;
    this.integratedChunks += 1;
  }

  public getGenerationStats(): ChunkGenerationStats {
    return this.generationQueue.getStats();
  }

  public getIntegrationStats(): ChunkIntegrationStats {
    return {
      lastIntegrationMs: this.lastIntegrationMs,
      lastGeneratedIntegrationMs: this.lastGeneratedIntegrationMs,
      lastReadIntegrationMs: this.lastReadIntegrationMs,
      integratedChunks: this.integratedChunks,
      lastLightingInitMs: this.lastLightingInitMs,
      lastBorderReconcileMs: this.lastBorderReconcileMs,
      lastNeighbourDirtyCount: this.lastNeighbourDirtyCount,
      pendingIntegrations: this.lastIntegrationQueueDepth,
      lastIntegrationLatencyMs: this.lastIntegrationLatencyMs,
    };
  }

  public dispose(): void {
    this.disposed = true;
    this.desiredChunks.clear();
    this.loadingChunks.clear();
    this.pendingIntegrations.clear();
    this.generationQueue.dispose();
  }

  /** Stop accepting new streaming work (reads/unloads) during quiesce. */
  public stopAccepting(): void {
    this.quiescing = true;
  }

  /** Resume streaming after returning to gameplay from a failed Save-and-Quit. */
  public resume(): void {
    this.quiescing = false;
    this.unloadFailure = null;
  }

  public get pendingReadCount(): number {
    return this.activeReads.size;
  }

  public get pendingUnloadCount(): number {
    return this.activeUnloads.size;
  }

  /**
   * Cancel pending reads (correction 3). Reads already dispatched to the read
   * lane may not be physically cancellable; their results are detached from
   * gameplay (ignored) but their promises are still tracked to settlement so
   * none can reject unobserved. Idempotent; never integrates a chunk afterwards.
   */
  public cancelPendingReads(): void {
    this.quiescing = true;
    // Reads not yet dispatched will not be (update/dispatchLoad guard on quiescing).
    // In-flight reads complete but their results are ignored (dispatchLoad checks quiescing).
  }

  /** Resolves once every accepted read has settled (detached results included). */
  public settleAcceptedReads(): Promise<void> {
    return Promise.all([...this.activeReads.values()]).then(() => undefined);
  }

  /**
   * The single authoritative owner of unload settlement (correction 2). Resolves
   * once every accepted unload has finished its serialized persistence work;
   * rejects if any unload failed (so the final save is aborted, not papered over).
   */
  public async settleAcceptedUnloads(): Promise<void> {
    await Promise.all([...this.activeUnloads.values()]);
    if (this.unloadFailure !== null) {
      const error = this.unloadFailure;
      this.unloadFailure = null;
      throw error;
    }
  }

  private streamAround(
    centerX: number,
    centerZ: number,
    cameraDir: { x: number; z: number },
    moveDir: { x: number; z: number } | null,
  ): void {
    this.desiredChunks.clear();
    const toRequest: Array<{ x: number; z: number; priority: number; critical: boolean }> = [];

    for (let dz = -CHUNK_LOAD_RADIUS; dz <= CHUNK_LOAD_RADIUS; dz++) {
      for (let dx = -CHUNK_LOAD_RADIUS; dx <= CHUNK_LOAD_RADIUS; dx++) {
        const x = centerX + dx;
        const z = centerZ + dz;
        const distanceSq = dx * dx + dz * dz;
        const critical = Math.max(Math.abs(dx), Math.abs(dz)) <= CRITICAL_CHUNK_RADIUS;
        const len = Math.hypot(dx, dz) || 1;
        const nx = dx / len;
        const nz = dz / len;
        const cameraBoost = Math.max(0, nx * cameraDir.x + nz * cameraDir.z) * 120;
        const movementBoost = moveDir === null ? 0 : Math.max(0, nx * moveDir.x + nz * moveDir.z) * 180;
        const priority = distanceSq * 1000 - (critical ? 5000 : 0) - cameraBoost - movementBoost;
        const key = chunkKey(x, z);
        this.desiredChunks.add(key);

        if (!this.chunkManager.hasChunk(x, z) && !this.loadingChunks.has(key)) {
          toRequest.push({ x, z, priority, critical });
        }
      }
    }

    toRequest.sort((a, b) => a.priority - b.priority);
    for (const request of toRequest) {
      this.dispatchLoad(request.x, request.z, request.priority, request.critical);
    }
    this.generationQueue.cancelUndesired(this.desiredChunks);

    const toUnload: Array<{ x: number; z: number }> = [];

    for (const chunk of this.chunkManager) {
      const dist = Math.max(
        Math.abs(chunk.chunkX - centerX),
        Math.abs(chunk.chunkZ - centerZ),
      );

      if (dist > CHUNK_UNLOAD_RADIUS) {
        toUnload.push({ x: chunk.chunkX, z: chunk.chunkZ });
      } else {
        this.persistence.cancelUnload(chunk);
      }
    }

    for (const { x, z } of toUnload) {
      const chunk = this.chunkManager.getChunk(x, z);
      if (chunk) {
        // Stop normal mutation first: snapshot scheduled ticks before unloading.
        chunk.requireScheduledTickUnloadSnapshot();
        if (!chunk.isPersistenceDirty()) {
          this.chunkRenderer.removeChunkMesh(x, z);
          this.chunkManager.removeChunk(x, z);
          this.markNeighboursDirty(x, z, { forceAll: true });
        } else {
          // State-transition unload: save the final revision once and remove the
          // chunk only after the write succeeds (no save-until-clean loop). The
          // ChunkStreamer tracks the unload to settlement (single owner, correction 2).
          const unloadKey = chunkKey(x, z);
          const tracked = this.persistence.requestUnload(chunk).then(() => {
            if (this.disposed) return;
            if (!this.quiescing && !this.desiredChunks.has(unloadKey)) {
              this.chunkRenderer.removeChunkMesh(x, z);
              this.chunkManager.removeChunk(x, z);
              this.markNeighboursDirty(x, z, { forceAll: true });
            }
          }).catch((error) => {
            // Record the failure so settleAcceptedUnloads can abort the final save
            // (correction 4). The chunk stays loaded (dirty) and is covered by the
            // forced save if it is still wanted.
            this.unloadFailure = error;
            console.warn(`[ChunkStreamer] unload save failed for ${unloadKey}:`, error);
          }).finally(() => {
            this.activeUnloads.delete(unloadKey);
          });
          this.activeUnloads.set(unloadKey, tracked);
        }
      }
    }
  }

  private dispatchLoad(x: number, z: number, priority: number, critical: boolean): void {
    if (this.disposed || this.halted || this.quiescing) return;
    const k = chunkKey(x, z);
    this.loadingChunks.add(k);

    const readPromise = this.persistence.loadChunk(x, z).then(chunk => {
      // Detach after quiesce: never integrate or generate a chunk during/after
      // Save-and-Quit quiesce (correction 3).
      if (this.disposed || this.quiescing) return;
      if (!this.desiredChunks.has(k)) return;

      if (chunk === undefined) {
        // Miss, fallback to generation
        this.generationQueue.enqueue(x, z, priority, critical);
      } else {
        // Hit: adopt storage immediately (cheap), then queue the expensive
        // lighting/border stages through the same budgeted pipeline the
        // generated results use.
        const managed = this.chunkManager.getOrCreateChunk(x, z);
        managed.adoptStorageFrom(chunk);
        managed.setPersistedLightingDataLoaded(chunk.loadedPersistedLightingData());
        managed.setTerrainPopulated(chunk.isTerrainPopulated());
        managed.getScheduledTicks().load(chunk.getScheduledTicks().drainAll());
        managed.markPersistenceClean(chunk.getPersistenceRevision());

        this.pendingIntegrations.set(k, {
          chunk: managed,
          persisted: true,
          trustLighting: this.trustPersistedLighting && chunk.loadedPersistedLightingData(),
          readyAtMs: performance.now(),
        });
      }
    }).catch((error) => {
      // During/after quiesce, detached read errors are observed (no unhandled
      // rejection) but not acted upon.
      if (this.disposed || this.quiescing) return;
      if (error instanceof RecordCorruptionError) {
        // Fail loud: a present-but-invalid record halts the world. Never treat it
        // as missing, never regenerate over it, never fall back to legacy.
        this.halted = true;
        this.onPersistenceError?.(error);
      } else {
        // Non-corruption read failure: leave the chunk unloaded; retried on the
        // next streaming update.
        console.warn(`[ChunkStreamer] chunk read failed for ${k}:`, error);
      }
    }).finally(() => {
      this.loadingChunks.delete(k);
      this.activeReads.delete(k);
    });
    this.activeReads.set(k, readPromise);
  }

  /**
   * After integrating `chunkX,chunkZ`, decide neighbor remeshes:
   * - topology seam: neighbor always needs remesh so its outer faces cull against the new chunk
   * - light delta: neighbors listed by LightEngine.lastBorderLightDirtyNeighbors
   * Unload path still force-dirties all neighbors (pass forceAll=true).
   */
  private markNeighboursDirty(
    chunkX: number,
    chunkZ: number,
    options: { readonly forceAll?: boolean; readonly topologySeam?: boolean } = {},
  ): number {
    const forceAll = options.forceAll === true;
    // A newly present neighbor changes face-culling against "missing chunk = solid occluder?"
    // Our mesher treats missing neighbors as air — so a new chunk ALWAYS creates a topology seam
    // for existing neighbors (faces that were emitted outward must be re-evaluated).
    const topologySeam = options.topologySeam !== false;

    const dirtyKeys = new Set<string>();
    if (forceAll || topologySeam) {
      for (const [dx, dz] of NEIGHBOUR_OFFSETS) {
        const neighbour = this.chunkManager.getChunk(chunkX + dx, chunkZ + dz);
        if (neighbour !== undefined) {
          neighbour.markTopologyDirty();
          dirtyKeys.add(`${neighbour.chunkX},${neighbour.chunkZ}`);
        }
      }
    }

    if (!forceAll) {
      for (const pos of this.lightEngine.lastBorderLightDirtyNeighbors) {
        // Don't double-count; light-only still full remesh for now.
        const neighbour = this.chunkManager.getChunk(pos.chunkX, pos.chunkZ);
        if (neighbour === undefined) continue;
        const key = `${pos.chunkX},${pos.chunkZ}`;
        if (dirtyKeys.has(key)) continue;
        neighbour.markLightingDirty();
        dirtyKeys.add(key);
      }
    }

    return dirtyKeys.size;
  }

}
