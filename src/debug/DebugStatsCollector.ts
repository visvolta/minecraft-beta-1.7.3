import type { Renderer } from '../rendering/Renderer';
import type * as THREE from 'three';
import type { Player } from '../player/Player';
import type { ChunkManager } from '../world/ChunkManager';
import type { ChunkRenderer } from '../rendering/ChunkRenderer';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../world/chunkConstants';
import { ClimateSampler } from '../world/generation/climate/ClimateSampler';
import { selectBiome } from '../world/generation/climate/BiomeSelector';
import { FrameTimeTracker } from './DebugStats';
import type { DebugStats } from './DebugStats';
import type { WorldTime } from '../world/WorldTime';
import type { SkyRenderer } from '../rendering/sky/SkyRenderer';

function formatHexColor(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0').toUpperCase()}`;
}

export class DebugStatsCollector {
  private readonly player: Player;
  private readonly chunkManager: ChunkManager;
  private readonly chunkRenderer: ChunkRenderer;
  private readonly sceneRenderer: Renderer;
  private readonly skyRenderer: SkyRenderer;
  private readonly threeRenderer: THREE.WebGLRenderer;
  private readonly worldSeed: bigint;
  private readonly climateSampler: ClimateSampler;
  private readonly worldTime: WorldTime;
  private readonly frameTimeTracker = new FrameTimeTracker();

  public constructor(
    player: Player,
    chunkManager: ChunkManager,
    chunkRenderer: ChunkRenderer,
    sceneRenderer: Renderer,
    skyRenderer: SkyRenderer,
    threeRenderer: THREE.WebGLRenderer,
    worldSeed: bigint,
    worldTime: WorldTime,
  ) {
    this.player = player;
    this.chunkManager = chunkManager;
    this.chunkRenderer = chunkRenderer;
    this.sceneRenderer = sceneRenderer;
    this.skyRenderer = skyRenderer;
    this.threeRenderer = threeRenderer;
    this.worldSeed = worldSeed;
    this.worldTime = worldTime;
    this.climateSampler = new ClimateSampler(worldSeed);
  }

  public recordFrame(deltaSeconds: number): void {
    this.frameTimeTracker.record(deltaSeconds);
  }

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
    const fog = this.sceneRenderer.getCurrentFogState();
    const sky = this.skyRenderer.getCurrentState();

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
      worldTime: this.worldTime.getTimeOfDayTicks(),
      dayNumber: this.worldTime.getDayNumber(),
      celestialAngle: this.worldTime.getCelestialAngle(),
      skyPhase: sky.skyPhase,
      loadedChunks: this.chunkManager.size,
      visibleChunkMeshes: this.chunkRenderer.getVisibleMeshCount(),

      triangleCount: info.render.triangles,
      drawCalls: info.render.calls,
      dirtyChunkQueueSize: this.chunkManager.countDirtyChunks(),

      fogMode: fog.mode,
      fogNear: fog.near,
      fogFar: fog.far,
      starOpacity: sky.starOpacity,
      sunAltitude: sky.sunAltitude,
      skyColorHex: formatHexColor(sky.skyColorHex),
      fogColorHex: formatHexColor(fog.colorHex),

      noClip,
    };
  }
}
