import type { ChunkRenderer } from '../rendering/ChunkRenderer';
import type { ChunkManager } from './ChunkManager';
import type { WorldGenerator } from './WorldGenerator';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from './chunkConstants';
import type { LightEngine } from './generation/lighting/LightEngine';
import { ChunkGenerationQueue, type ChunkGenerationStats } from './streaming/ChunkGenerationQueue';

/** Chebyshev radius (square) for loading chunks around the camera. */
export const CHUNK_LOAD_RADIUS = 6;

/** Unload when farther than this (hysteresis vs load radius). */
export const CHUNK_UNLOAD_RADIUS = CHUNK_LOAD_RADIUS + 1;

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
  private readonly desiredChunks = new Set<string>();

  private lastChunkX: number | null = null;
  private lastChunkZ: number | null = null;
  private lastPriorityHeadingX = Number.NaN;
  private lastPriorityHeadingZ = Number.NaN;
  private started = false;

  public constructor(
    chunkManager: ChunkManager,
    generator: WorldGenerator,
    chunkRenderer: ChunkRenderer,
    lightEngine: LightEngine,
    worldSeed: bigint,
  ) {
    this.chunkManager = chunkManager;
    this.chunkRenderer = chunkRenderer;
    this.lightEngine = lightEngine;
    this.generationQueue = new ChunkGenerationQueue(chunkManager, generator, worldSeed);
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
    const completed = this.generationQueue.process(
      MAX_SYNC_GENERATION_JOBS_PER_FRAME,
      MAX_SYNC_GENERATION_MS_PER_FRAME,
      this.desiredChunks,
      allowNonCriticalDispatch,
    );
    for (const { chunk } of completed) {
      this.lightEngine.initializeChunkLighting(chunk);
      this.lightEngine.reconcileChunkBorders(chunk);
      this.markNeighboursDirty(chunk.chunkX, chunk.chunkZ);
    }
  }

  public getGenerationStats(): ChunkGenerationStats {
    return this.generationQueue.getStats();
  }

  public dispose(): void {
    this.generationQueue.dispose();
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
        this.desiredChunks.add(this.key(x, z));

        if (!this.chunkManager.hasChunk(x, z)) {
          toRequest.push({ x, z, priority, critical });
        }
      }
    }

    toRequest.sort((a, b) => a.priority - b.priority);
    for (const request of toRequest) {
      this.generationQueue.enqueue(request.x, request.z, request.priority, request.critical);
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
      }
    }

    for (const { x, z } of toUnload) {
      this.chunkRenderer.removeChunkMesh(x, z);
      this.chunkManager.removeChunk(x, z);
      this.markNeighboursDirty(x, z);
    }
  }

  private markNeighboursDirty(chunkX: number, chunkZ: number): void {
    for (const [dx, dz] of NEIGHBOUR_OFFSETS) {
      const neighbour = this.chunkManager.getChunk(chunkX + dx, chunkZ + dz);
      neighbour?.markDirty();
    }
  }

  private key(chunkX: number, chunkZ: number): string {
    return `${chunkX},${chunkZ}`;
  }
}
