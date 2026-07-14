import type { ChunkRenderer } from '../rendering/ChunkRenderer';
import type { ChunkManager } from './ChunkManager';
import type { WorldGenerator } from './WorldGenerator';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from './chunkConstants';

/** Chebyshev radius (square) for loading chunks around the camera. */
export const CHUNK_LOAD_RADIUS = 6;

/** Unload when farther than this (hysteresis vs load radius). */
export const CHUNK_UNLOAD_RADIUS = CHUNK_LOAD_RADIUS + 1;

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
  private readonly generator: WorldGenerator;
  private readonly chunkRenderer: ChunkRenderer;

  private lastChunkX: number | null = null;
  private lastChunkZ: number | null = null;
  private started = false;

  public constructor(
    chunkManager: ChunkManager,
    generator: WorldGenerator,
    chunkRenderer: ChunkRenderer,
  ) {
    this.chunkManager = chunkManager;
    this.generator = generator;
    this.chunkRenderer = chunkRenderer;
  }

  /**
   * Re-evaluates the loaded set when first run or when the camera chunk changes.
   */
  public update(cameraWorldX: number, cameraWorldZ: number): void {
    const chunkX = Math.floor(cameraWorldX / CHUNK_SIZE_X);
    const chunkZ = Math.floor(cameraWorldZ / CHUNK_SIZE_Z);

    if (
      !this.started ||
      chunkX !== this.lastChunkX ||
      chunkZ !== this.lastChunkZ
    ) {
      this.streamAround(chunkX, chunkZ);
      this.lastChunkX = chunkX;
      this.lastChunkZ = chunkZ;
      this.started = true;
    }
  }

  private streamAround(centerX: number, centerZ: number): void {
    for (let dz = -CHUNK_LOAD_RADIUS; dz <= CHUNK_LOAD_RADIUS; dz++) {
      for (let dx = -CHUNK_LOAD_RADIUS; dx <= CHUNK_LOAD_RADIUS; dx++) {
        const x = centerX + dx;
        const z = centerZ + dz;

        if (this.chunkManager.hasChunk(x, z)) {
          continue;
        }

        const chunk = this.chunkManager.getOrCreateChunk(x, z);
        this.generator.populate(chunk);
        this.markNeighboursDirty(x, z);
      }
    }

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
}
