import type * as THREE from 'three';
import type { Player } from '../player/Player';
import type { ChunkManager } from '../world/ChunkManager';
import type { ChunkRenderer } from '../rendering/ChunkRenderer';
import type { ChunkStreamer } from '../world/ChunkStreamer';
import type { EntityManager } from '../entities/core/EntityManager';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../world/chunkConstants';
import { FrameTimeTracker } from './DebugStats';
import type { DebugStats } from './DebugStats';

/** Beta `GuiIngame`: f = floor(yaw * 4 / 360 + 0.5) & 3, 0 = south. */
const FACING_NAMES: readonly string[] = ['South', 'West', 'North', 'East'];

/**
 * Heap sampling is comparatively expensive and changes slowly, so it is
 * refreshed on a timer rather than every frame.
 */
const MEMORY_SAMPLE_INTERVAL_MS = 500;

interface HeapCapableP {
  memory?: { usedJSHeapSize: number; totalJSHeapSize: number };
}

/**
 * Gathers the handful of values the Beta-style F3 overlay shows.
 *
 * Every read here is an already-maintained counter (`chunkManager.size`,
 * `entityManager.activeCount`, `renderer.info`, queue depths) — populating
 * F3 must never trigger a world scan, a biome sample or an occlusion
 * analysis. Deep profiling belongs to PerformanceProfiler, reachable via
 * the `window.__mcDebug` console API.
 */
export class DebugStatsCollector {
  private readonly frameTimeTracker = new FrameTimeTracker();
  private nextMemorySampleMs = 0;
  private memoryUsedMb = 0;
  private memoryTotalMb = 0;

  public constructor(
    private readonly player: Player,
    private readonly chunkManager: ChunkManager,
    private readonly chunkRenderer: ChunkRenderer,
    private readonly chunkStreamer: ChunkStreamer,
    private readonly entityManager: EntityManager,
    private readonly threeRenderer: THREE.WebGLRenderer,
    private readonly getCameraYaw: () => number,
    private readonly getDimensionLabel: () => string,
  ) {}

  public recordFrame(deltaSeconds: number): void {
    this.frameTimeTracker.record(deltaSeconds);
  }

  public collect(): DebugStats {
    const info = this.threeRenderer.info;
    const meshingStats = this.chunkRenderer.getMeshingStats();
    const generationStats = this.chunkStreamer.getGenerationStats();

    const yawDegrees = (this.getCameraYaw() * 180) / Math.PI;
    const facingIndex = Math.floor(yawDegrees * 4 / 360 + 0.5) & 3;

    this.sampleMemory();

    return {
      fps: this.frameTimeTracker.getFps(),
      frameTimeMs: this.frameTimeTracker.getAverageFrameTimeMs(),

      playerX: this.player.position.x,
      playerY: this.player.position.y,
      playerZ: this.player.position.z,
      chunkX: Math.floor(this.player.position.x / CHUNK_SIZE_X),
      chunkZ: Math.floor(this.player.position.z / CHUNK_SIZE_Z),
      facingIndex,
      facingName: FACING_NAMES[facingIndex] ?? 'South',

      dimensionLabel: this.getDimensionLabel(),
      loadedChunks: this.chunkManager.size,
      entityCount: this.entityManager.activeCount,

      triangleCount: info.render.triangles,
      drawCalls: info.render.calls,

      memoryUsedMb: this.memoryUsedMb,
      memoryTotalMb: this.memoryTotalMb,

      generationQueueSize: generationStats.queued,
      meshingQueueSize: meshingStats.queued + meshingStats.pendingUploads,
    };
  }

  private sampleMemory(): void {
    const now = performance.now();
    if (now < this.nextMemorySampleMs) return;
    this.nextMemorySampleMs = now + MEMORY_SAMPLE_INTERVAL_MS;

    const memory = (performance as unknown as HeapCapableP).memory;
    if (memory === undefined) {
      this.memoryUsedMb = 0;
      this.memoryTotalMb = 0;
      return;
    }
    this.memoryUsedMb = memory.usedJSHeapSize / (1024 * 1024);
    this.memoryTotalMb = memory.totalJSHeapSize / (1024 * 1024);
  }
}
