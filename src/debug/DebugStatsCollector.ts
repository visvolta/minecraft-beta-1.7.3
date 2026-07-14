import type * as THREE from 'three';
import type { Player } from '../player/Player';
import type { ChunkManager } from '../world/ChunkManager';
import type { ChunkRenderer } from '../rendering/ChunkRenderer';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../world/chunkConstants';
import { ClimateSampler } from '../world/generation/climate/ClimateSampler';
import { selectBiome } from '../world/generation/climate/BiomeSelector';
import { FrameTimeTracker } from './DebugStats';
import type { DebugStats } from './DebugStats';

/**
 * Assembles a DebugStats snapshot each frame from the various systems
 * the F3 overlay needs to read. Isolated here (rather than inline in
 * Engine.tick()) so Engine only wires references together and the
 * "what does the overlay show" logic lives in one debug-only place.
 *
 * Biome is sampled on demand (a single-column ClimateSampler query)
 * each time collect() is called, rather than cached per chunk — cheap
 * (one column, not a full chunk) and always exactly matches the
 * player's current position, including mid-chunk movement.
 */
export class DebugStatsCollector {
  private readonly player: Player;
  private readonly chunkManager: ChunkManager;
  private readonly chunkRenderer: ChunkRenderer;
  private readonly threeRenderer: THREE.WebGLRenderer;
  private readonly worldSeed: bigint;
  private readonly climateSampler: ClimateSampler;
  private readonly frameTimeTracker = new FrameTimeTracker();

  public constructor(
    player: Player,
    chunkManager: ChunkManager,
    chunkRenderer: ChunkRenderer,
    threeRenderer: THREE.WebGLRenderer,
    worldSeed: bigint,
  ) {
    this.player = player;
    this.chunkManager = chunkManager;
    this.chunkRenderer = chunkRenderer;
    this.threeRenderer = threeRenderer;
    this.worldSeed = worldSeed;
    this.climateSampler = new ClimateSampler(worldSeed);
  }

  /** Call once per frame (every frame, regardless of overlay visibility) to keep FPS smoothing accurate. */
  public recordFrame(deltaSeconds: number): void {
    this.frameTimeTracker.record(deltaSeconds);
  }

  /** Produces this frame's stats snapshot. Cheap enough to call only while the overlay is visible. */
  public collect(noClip: boolean): DebugStats {
    const chunkX = Math.floor(this.player.position.x / CHUNK_SIZE_X);
    const chunkZ = Math.floor(this.player.position.z / CHUNK_SIZE_Z);

    const [climate] = this.climateSampler.sampleRegion(
      Math.floor(this.player.position.x),
      Math.floor(this.player.position.z),
      1,
      1,
    );
    const biome = selectBiome(climate!);

    const info = this.threeRenderer.info;

    return {
      fps: this.frameTimeTracker.getFps(),
      frameTimeMs: this.frameTimeTracker.getAverageFrameTimeMs(),

      playerX: this.player.position.x,
      playerY: this.player.position.y,
      playerZ: this.player.position.z,
      chunkX,
      chunkZ,

      biomeName: biome.displayName,
      worldSeed: this.worldSeed.toString(),
      loadedChunks: this.chunkManager.size,
      visibleChunkMeshes: this.chunkRenderer.getVisibleMeshCount(),

      triangleCount: info.render.triangles,
      drawCalls: info.render.calls,
      dirtyChunkQueueSize: this.chunkManager.countDirtyChunks(),

      noClip,
    };
  }
}
