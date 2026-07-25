import type { ChunkManager } from '../../ChunkManager';
import type { BlockRegistry } from '../../../blocks/BlockRegistry';
import type { Chunk } from '../../Chunk';
import { CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z } from '../../chunkConstants';
import { chunkKey } from '../../chunkKey';

export interface LightEngineMetrics {
  readonly propagationCalls: number;
  readonly averageBfsQueueSize: number;
  readonly maximumBfsQueueSize: number;
  readonly nodesProcessed: number;
  readonly propagationMs: number;
  readonly initializationMs: number;
  readonly borderReconcileMs: number;
  readonly localRelightMs: number;
  readonly blockReads: number;
  readonly lightReads: number;
  readonly lightWrites: number;
  readonly opacityQueries: number;
  readonly emissionQueries: number;
  readonly coordinateConversions: number;
  readonly chunkLookups: number;
  readonly missingChunkLookups: number;
  readonly boundaryTraversals: number;
  readonly queuePushes: number;
  readonly removeQueuePushes: number;
  readonly queueNodeAllocations: number;
  readonly remeshFanOutChunks: number;
}

const NEIGHBORS = [
  { dx: 1, dy: 0, dz: 0 },
  { dx: -1, dy: 0, dz: 0 },
  { dx: 0, dy: 1, dz: 0 },
  { dx: 0, dy: -1, dz: 0 },
  { dx: 0, dy: 0, dz: 1 },
  { dx: 0, dy: 0, dz: -1 },
];

/**
 * Core Beta-style lighting engine.
 * Computes, propagates, and removes skylight and blocklight deterministically
 * using queue-based 3D flood-fill algorithms across chunk boundaries.
 */
export class LightEngine {
  private readonly chunkManager: ChunkManager;
  private readonly blockRegistry: BlockRegistry;
  private metricsEnabled = false;

  // BFS queue metrics for profiling
  private propagationCallsCount = 0;
  private totalBfsQueueSize = 0;
  private maxBfsQueueSize = 0;
  private nodesProcessed = 0;
  private propagationTimeMs = 0;
  private initializationTimeMs = 0;
  private borderReconcileTimeMs = 0;
  private localRelightTimeMs = 0;
  private blockReads = 0;
  private lightReads = 0;
  private lightWrites = 0;
  private opacityQueries = 0;
  private emissionQueries = 0;
  private coordinateConversions = 0;
  private chunkLookups = 0;
  private missingChunkLookups = 0;
  private boundaryTraversals = 0;
  private queuePushes = 0;
  private removeQueuePushes = 0;
  private queueNodeAllocations = 0;
  private readonly remeshFanOutChunkKeys = new Set<number>();

  public constructor(chunkManager: ChunkManager, blockRegistry: BlockRegistry) {
    this.chunkManager = chunkManager;
    this.blockRegistry = blockRegistry;
  }

  public setMetricsEnabled(enabled: boolean): void {
    this.metricsEnabled = enabled;
  }

  /** Returns and resets accumulated BFS queue metrics for profiling. */
  public drainBfsMetrics(): LightEngineMetrics {
    const calls = this.propagationCallsCount;
    const avg = calls > 0 ? this.totalBfsQueueSize / calls : 0;
    const max = this.maxBfsQueueSize;
    const nodes = this.nodesProcessed;
    const propagationMs = this.propagationTimeMs;
    const initializationMs = this.initializationTimeMs;
    const borderReconcileMs = this.borderReconcileTimeMs;
    const localRelightMs = this.localRelightTimeMs;
    const metrics: LightEngineMetrics = {
      propagationCalls: calls,
      averageBfsQueueSize: avg,
      maximumBfsQueueSize: max,
      nodesProcessed: nodes,
      propagationMs,
      initializationMs,
      borderReconcileMs,
      localRelightMs,
      blockReads: this.blockReads,
      lightReads: this.lightReads,
      lightWrites: this.lightWrites,
      opacityQueries: this.opacityQueries,
      emissionQueries: this.emissionQueries,
      coordinateConversions: this.coordinateConversions,
      chunkLookups: this.chunkLookups,
      missingChunkLookups: this.missingChunkLookups,
      boundaryTraversals: this.boundaryTraversals,
      queuePushes: this.queuePushes,
      removeQueuePushes: this.removeQueuePushes,
      queueNodeAllocations: this.queueNodeAllocations,
      remeshFanOutChunks: this.remeshFanOutChunkKeys.size,
    };
    this.propagationCallsCount = 0;
    this.totalBfsQueueSize = 0;
    this.maxBfsQueueSize = 0;
    this.nodesProcessed = 0;
    this.propagationTimeMs = 0;
    this.initializationTimeMs = 0;
    this.borderReconcileTimeMs = 0;
    this.localRelightTimeMs = 0;
    this.blockReads = 0;
    this.lightReads = 0;
    this.lightWrites = 0;
    this.opacityQueries = 0;
    this.emissionQueries = 0;
    this.coordinateConversions = 0;
    this.chunkLookups = 0;
    this.missingChunkLookups = 0;
    this.boundaryTraversals = 0;
    this.queuePushes = 0;
    this.removeQueuePushes = 0;
    this.queueNodeAllocations = 0;
    this.remeshFanOutChunkKeys.clear();
    return metrics;
  }

  // ==========================================
  // Getters & Setters (Absolute World Space)
  // ==========================================

  public getBlock(x: number, y: number, z: number): number {
    if (this.metricsEnabled) this.blockReads++;
    if (y < 0 || y >= CHUNK_SIZE_Y) return 0;
    if (this.metricsEnabled) this.coordinateConversions++;
    const chunkX = Math.floor(x / CHUNK_SIZE_X);
    const chunkZ = Math.floor(z / CHUNK_SIZE_Z);
    const localX = x - chunkX * CHUNK_SIZE_X;
    const localZ = z - chunkZ * CHUNK_SIZE_Z;
    if (this.metricsEnabled) this.chunkLookups++;
    const chunk = this.chunkManager.getChunk(chunkX, chunkZ);
    if (chunk === undefined) { if (this.metricsEnabled) this.missingChunkLookups++; return 0; }
    return chunk.getBlock(localX, y, localZ);
  }

  public getSkylight(x: number, y: number, z: number): number {
    if (this.metricsEnabled) this.lightReads++;
    if (y < 0) return 0;
    if (y >= CHUNK_SIZE_Y) return 15; // Void above gets full skylight
    if (this.metricsEnabled) this.coordinateConversions++;
    const chunkX = Math.floor(x / CHUNK_SIZE_X);
    const chunkZ = Math.floor(z / CHUNK_SIZE_Z);
    const localX = x - chunkX * CHUNK_SIZE_X;
    const localZ = z - chunkZ * CHUNK_SIZE_Z;
    if (this.metricsEnabled) this.chunkLookups++;
    const chunk = this.chunkManager.getChunk(chunkX, chunkZ);
    if (chunk === undefined) { if (this.metricsEnabled) this.missingChunkLookups++; return y >= 64 ? 15 : 0; }
    return chunk.getSkylight(localX, y, localZ);
  }

  public setSkylight(x: number, y: number, z: number, val: number): void {
    if (y < 0 || y >= CHUNK_SIZE_Y) return;
    if (this.metricsEnabled) this.coordinateConversions++;
    const chunkX = Math.floor(x / CHUNK_SIZE_X);
    const chunkZ = Math.floor(z / CHUNK_SIZE_Z);
    const localX = x - chunkX * CHUNK_SIZE_X;
    const localZ = z - chunkZ * CHUNK_SIZE_Z;
    if (this.metricsEnabled) this.chunkLookups++;
    const chunk = this.chunkManager.getChunk(chunkX, chunkZ);
    if (chunk) {
      if (chunk.getSkylight(localX, y, localZ) !== (val & 0x0F)) {
        if (this.metricsEnabled) this.lightWrites++;
        if (this.metricsEnabled) this.remeshFanOutChunkKeys.add(chunkKey(chunkX, chunkZ));
      }
      chunk.setSkylight(localX, y, localZ, val);
    } else {
      if (this.metricsEnabled) this.missingChunkLookups++;
    }
  }

  public getBlocklight(x: number, y: number, z: number): number {
    if (this.metricsEnabled) this.lightReads++;
    if (y < 0 || y >= CHUNK_SIZE_Y) return 0;
    if (this.metricsEnabled) this.coordinateConversions++;
    const chunkX = Math.floor(x / CHUNK_SIZE_X);
    const chunkZ = Math.floor(z / CHUNK_SIZE_Z);
    const localX = x - chunkX * CHUNK_SIZE_X;
    const localZ = z - chunkZ * CHUNK_SIZE_Z;
    if (this.metricsEnabled) this.chunkLookups++;
    const chunk = this.chunkManager.getChunk(chunkX, chunkZ);
    if (chunk === undefined) { if (this.metricsEnabled) this.missingChunkLookups++; return 0; }
    return chunk.getBlocklight(localX, y, localZ);
  }

  public setBlocklight(x: number, y: number, z: number, val: number): void {
    if (y < 0 || y >= CHUNK_SIZE_Y) return;
    if (this.metricsEnabled) this.coordinateConversions++;
    const chunkX = Math.floor(x / CHUNK_SIZE_X);
    const chunkZ = Math.floor(z / CHUNK_SIZE_Z);
    const localX = x - chunkX * CHUNK_SIZE_X;
    const localZ = z - chunkZ * CHUNK_SIZE_Z;
    if (this.metricsEnabled) this.chunkLookups++;
    const chunk = this.chunkManager.getChunk(chunkX, chunkZ);
    if (chunk) {
      if (chunk.getBlocklight(localX, y, localZ) !== (val & 0x0F)) {
        if (this.metricsEnabled) this.lightWrites++;
        if (this.metricsEnabled) this.remeshFanOutChunkKeys.add(chunkKey(chunkX, chunkZ));
      }
      chunk.setBlocklight(localX, y, localZ, val);
    } else {
      if (this.metricsEnabled) this.missingChunkLookups++;
    }
  }

  public getOpacity(x: number, y: number, z: number): number {
    if (this.metricsEnabled) this.opacityQueries++;
    if (y < 0 || y >= CHUNK_SIZE_Y) return 0;
    if (this.metricsEnabled) this.coordinateConversions++;
    const chunkX = Math.floor(x / CHUNK_SIZE_X);
    const chunkZ = Math.floor(z / CHUNK_SIZE_Z);
    const localX = x - chunkX * CHUNK_SIZE_X;
    const localZ = z - chunkZ * CHUNK_SIZE_Z;
    if (this.metricsEnabled) this.chunkLookups++;
    const chunk = this.chunkManager.getChunk(chunkX, chunkZ);
    if (!chunk) {
      if (this.metricsEnabled) this.missingChunkLookups++;
      return y >= 64 ? 0 : 15; // Unloaded chunk: Air above sea level, Solid stone below
    }

    const blockId = chunk.getBlock(localX, y, localZ);
    if (blockId === 0) return 0; // Air is fully transparent

    const def = this.blockRegistry.getById(blockId);
    if (def === undefined) return 15;

    // Standard fallback or custom value
    if (def.lightOpacity !== undefined) {
      return def.lightOpacity;
    }
    return def.solid ? 15 : 0;
  }

  public getEmission(x: number, y: number, z: number): number {
    if (this.metricsEnabled) this.emissionQueries++;
    const blockId = this.getBlock(x, y, z);
    if (blockId === 0) return 0;

    const def = this.blockRegistry.getById(blockId);
    if (def === undefined) return 0;

    return def.lightEmission ?? 0;
  }

  // ==========================================
  // Core Initial Chunk Lighting Calculation
  // ==========================================

  /**
   * Calculates the initial skylight and blocklight for a freshly generated chunk.
   * Feeds boundary blocks into propagation queues for seamless cross-chunk lighting.
   */
  public initializeChunkLighting(chunk: Chunk): void {
    const metricsStart = performance.now();
    const startX = chunk.chunkX * CHUNK_SIZE_X;
    const startZ = chunk.chunkZ * CHUNK_SIZE_Z;

    const skyPropQueue: number[] = [];
    const blockPropQueue: number[] = [];

    // 1. Initial vertical skylight projection based on heightmap
    for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
        const wx = startX + lx;
        const wz = startZ + lz;
        const height = chunk.getHeight(lx, lz);

        // Above/at the heightmap receives full sunlight (15)
        for (let y = CHUNK_SIZE_Y - 1; y >= height; y--) {
          chunk.setSkylight(lx, y, lz, 15);
        }
        
        // Enqueue the heightmap block itself so it propagates sunlight horizontally
        this.pushLightQueue(skyPropQueue, wx, height, wz);

        // Below the heightmap, sunlight attenuates vertically by block opacity
        let currentLight = 15;
        for (let y = height - 1; y >= 0; y--) {
          const opacity = this.getOpacity(wx, y, wz);
          currentLight -= Math.max(1, opacity);
          if (currentLight < 0) currentLight = 0;
          chunk.setSkylight(lx, y, lz, currentLight);

          // If there is still light, enqueue it so it can spread horizontally into overhangs/caves
          if (currentLight > 0) {
            this.pushLightQueue(skyPropQueue, wx, y, wz);
          }
        }

        // Scan for emissive blocks (blocklight sources)
        for (let y = 0; y < CHUNK_SIZE_Y; y++) {
          const emission = this.getEmission(wx, y, wz);
          if (emission > 0) {
            chunk.setBlocklight(lx, y, lz, emission);
            this.pushLightQueue(blockPropQueue, wx, y, wz);
          }
        }
      }
    }

    // 2. Propagate initial skylight and blocklight
    this.propagateSkylightQueue(skyPropQueue);
    this.propagateBlocklightQueue(blockPropQueue);
    this.initializationTimeMs += performance.now() - metricsStart;
  }

  // ==========================================
  // Propagation Routines (Queue-Based)
  // ==========================================

  public propagateSkylightQueue(queue: number[]): void {
    const metricsStart = performance.now();
    if (this.metricsEnabled) this.propagationCallsCount++;
    const initialQueueNodes = queue.length / 3;
    if (this.metricsEnabled && initialQueueNodes > this.maxBfsQueueSize) this.maxBfsQueueSize = initialQueueNodes;
    if (this.metricsEnabled) this.totalBfsQueueSize += initialQueueNodes;
    let head = 0;
    while (head < queue.length) {
      const cx = queue[head++]!;
      const cy = queue[head++]!;
      const cz = queue[head++]!;
      if (this.metricsEnabled) this.nodesProcessed++;
      const currentLight = this.getSkylight(cx, cy, cz);

      for (const { dx, dy, dz } of NEIGHBORS) {
        const nx = cx + dx;
        const ny = cy + dy;
        const nz = cz + dz;

        if (ny < 0 || ny >= CHUNK_SIZE_Y) continue;
        if ((dx !== 0 && Math.floor(nx / CHUNK_SIZE_X) !== Math.floor(cx / CHUNK_SIZE_X)) || (dz !== 0 && Math.floor(nz / CHUNK_SIZE_Z) !== Math.floor(cz / CHUNK_SIZE_Z))) if (this.metricsEnabled) this.boundaryTraversals++;

        const opacity = this.getOpacity(nx, ny, nz);
        const expected = currentLight - Math.max(1, opacity);
        const target = this.getSkylight(nx, ny, nz);

        if (expected > target) {
          this.setSkylight(nx, ny, nz, expected);
          this.pushLightQueue(queue, nx, ny, nz);
        }
      }
    }
    this.propagationTimeMs += performance.now() - metricsStart;
  }

  public propagateBlocklightQueue(queue: number[]): void {
    const metricsStart = performance.now();
    if (this.metricsEnabled) this.propagationCallsCount++;
    const initialQueueNodes = queue.length / 3;
    if (this.metricsEnabled && initialQueueNodes > this.maxBfsQueueSize) this.maxBfsQueueSize = initialQueueNodes;
    if (this.metricsEnabled) this.totalBfsQueueSize += initialQueueNodes;
    let head = 0;
    while (head < queue.length) {
      const cx = queue[head++]!;
      const cy = queue[head++]!;
      const cz = queue[head++]!;
      if (this.metricsEnabled) this.nodesProcessed++;
      const currentLight = this.getBlocklight(cx, cy, cz);

      for (const { dx, dy, dz } of NEIGHBORS) {
        const nx = cx + dx;
        const ny = cy + dy;
        const nz = cz + dz;

        if (ny < 0 || ny >= CHUNK_SIZE_Y) continue;
        if ((dx !== 0 && Math.floor(nx / CHUNK_SIZE_X) !== Math.floor(cx / CHUNK_SIZE_X)) || (dz !== 0 && Math.floor(nz / CHUNK_SIZE_Z) !== Math.floor(cz / CHUNK_SIZE_Z))) if (this.metricsEnabled) this.boundaryTraversals++;

        const opacity = this.getOpacity(nx, ny, nz);
        const expected = currentLight - Math.max(1, opacity);
        const target = this.getBlocklight(nx, ny, nz);

        if (expected > target) {
          this.setBlocklight(nx, ny, nz, expected);
          this.pushLightQueue(queue, nx, ny, nz);
        }
      }
    }
    this.propagationTimeMs += performance.now() - metricsStart;
  }

  // ==========================================
  // Local Relighting on Block Edit (Break/Place)
  // ==========================================

  /**
   * Calculates local relighting after a block change.
   * Employs both a removal queue and a propagation queue to achieve perfect local updates.
   */
  public handleBlockEdit(wx: number, wy: number, wz: number): void {
    const metricsStart = performance.now();
    // We update both skylight and blocklight around the edited coordinate
    this.updateLocalLight('sky', wx, wy, wz);
    this.updateLocalLight('block', wx, wy, wz);
    this.localRelightTimeMs += performance.now() - metricsStart;
  }

  private updateLocalLight(type: 'sky' | 'block', wx: number, wy: number, wz: number): void {
    const isSky = type === 'sky';
    const oldLight = isSky ? this.getSkylight(wx, wy, wz) : this.getBlocklight(wx, wy, wz);

    // Calculate new base value at the coordinate itself
    let newLight = 0;
    if (isSky) {
      if (this.metricsEnabled) this.coordinateConversions++;
      const chunkX = Math.floor(wx / CHUNK_SIZE_X);
      const chunkZ = Math.floor(wz / CHUNK_SIZE_Z);
      const localX = wx - chunkX * CHUNK_SIZE_X;
      const localZ = wz - chunkZ * CHUNK_SIZE_Z;
      if (this.metricsEnabled) this.chunkLookups++;
      const chunk = this.chunkManager.getChunk(chunkX, chunkZ);
      if (chunk === undefined) if (this.metricsEnabled) this.missingChunkLookups++;
      const height = chunk ? chunk.getHeight(localX, localZ) : 128;
      if (wy >= height) {
        newLight = 15;
      }
    } else {
      newLight = this.getEmission(wx, wy, wz);
    }

    if (newLight === 0) {
      // Find the maximum light from any neighbor minus the current opacity
      const opacity = this.getOpacity(wx, wy, wz);
      for (const { dx, dy, dz } of NEIGHBORS) {
        const nx = wx + dx;
        const ny = wy + dy;
        const nz = wz + dz;
        const neighborLight = isSky ? this.getSkylight(nx, ny, nz) : this.getBlocklight(nx, ny, nz);
        const val = neighborLight - Math.max(1, opacity);
        if (val > newLight) {
          newLight = val;
        }
      }
    }

    if (isSky) {
      this.setSkylight(wx, wy, wz, newLight);
    } else {
      this.setBlocklight(wx, wy, wz, newLight);
    }

    if (newLight < oldLight) {
      // Enqueue for removal / darkening
      const removeQueue: number[] = [];
      const propQueue: number[] = [];

      this.pushRemoveQueue(removeQueue, wx, wy, wz, oldLight);

      let head = 0;
      while (head < removeQueue.length) {
        const cx = removeQueue[head++]!;
        const cy = removeQueue[head++]!;
        const cz = removeQueue[head++]!;
        const oldVal = removeQueue[head++]!;

        for (const { dx, dy, dz } of NEIGHBORS) {
          const nx = cx + dx;
          const ny = cy + dy;
          const nz = cz + dz;

          if (ny < 0 || ny >= CHUNK_SIZE_Y) continue;

          const opacity = this.getOpacity(nx, ny, nz);
          const expected = oldVal - Math.max(1, opacity);
          const neighborLight = isSky ? this.getSkylight(nx, ny, nz) : this.getBlocklight(nx, ny, nz);

          if (neighborLight !== 0 && neighborLight <= expected) {
            // Darken this neighbor and continue propagation of darkening
            if (isSky) {
              this.setSkylight(nx, ny, nz, 0);
            } else {
              this.setBlocklight(nx, ny, nz, 0);
            }
            this.pushRemoveQueue(removeQueue, nx, ny, nz, neighborLight);
          } else if (neighborLight > 0) {
            // This neighbor is brighter and survived, enqueue it to light back the darkened region
            this.pushLightQueue(propQueue, nx, ny, nz);
          }
        }
      }

      // Propagate surviving lights back
      if (isSky) {
        this.propagateSkylightQueue(propQueue);
      } else {
        this.propagateBlocklightQueue(propQueue);
      }
    } else if (newLight > oldLight) {
      // Direct propagation of increased light
      const propQueue: number[] = [];
      this.pushLightQueue(propQueue, wx, wy, wz);
      if (isSky) {
        this.propagateSkylightQueue(propQueue);
      } else {
        this.propagateBlocklightQueue(propQueue);
      }
    }
  }

  // ==========================================
  // Loaded Chunk Boundary Reconciliation
  // ==========================================

  /**
   * Reconciles borders between a newly loaded chunk and its loaded neighbors,
   * enqueuing boundary blocks from both chunks to propagate light bidirectionally.
   */
  public reconcileChunkBorders(chunk: Chunk): void {
    const metricsStart = performance.now();
    const startX = chunk.chunkX * CHUNK_SIZE_X;
    const startZ = chunk.chunkZ * CHUNK_SIZE_Z;

    const skyQueue: number[] = [];
    const blockQueue: number[] = [];

    // 1. Scan our own chunk border blocks
    for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
        const isBorder = lx === 0 || lx === CHUNK_SIZE_X - 1 || lz === 0 || lz === CHUNK_SIZE_Z - 1;
        if (!isBorder) continue;

        const wx = startX + lx;
        const wz = startZ + lz;

        for (let y = 0; y < CHUNK_SIZE_Y; y++) {
          const sky = chunk.getSkylight(lx, y, lz);
          if (sky > 0) this.pushLightQueue(skyQueue, wx, y, wz);

          const block = chunk.getBlocklight(lx, y, lz);
          if (block > 0) this.pushLightQueue(blockQueue, wx, y, wz);
        }
      }
    }

    // 2. Scan border blocks of loaded orthogonal neighbors
    const neighborOffsets = [
      { dx: -1, dz: 0 },
      { dx: 1, dz: 0 },
      { dx: 0, dz: -1 },
      { dx: 0, dz: 1 },
    ];
    for (const { dx, dz } of neighborOffsets) {
      const neighbor = this.chunkManager.getChunk(chunk.chunkX + dx, chunk.chunkZ + dz);
      if (neighbor) {
        const nStartX = neighbor.chunkX * CHUNK_SIZE_X;
        const nStartZ = neighbor.chunkZ * CHUNK_SIZE_Z;
        
        let nMinX = 0, nMaxX = CHUNK_SIZE_X - 1;
        let nMinZ = 0, nMaxZ = CHUNK_SIZE_Z - 1;

        if (dx === -1) { nMinX = CHUNK_SIZE_X - 1; nMaxX = CHUNK_SIZE_X - 1; }
        else if (dx === 1) { nMinX = 0; nMaxX = 0; }
        if (dz === -1) { nMinZ = CHUNK_SIZE_Z - 1; nMaxZ = CHUNK_SIZE_Z - 1; }
        else if (dz === 1) { nMinZ = 0; nMaxZ = 0; }

        for (let lx = nMinX; lx <= nMaxX; lx++) {
          for (let lz = nMinZ; lz <= nMaxZ; lz++) {
            const wx = nStartX + lx;
            const wz = nStartZ + lz;
            for (let y = 0; y < CHUNK_SIZE_Y; y++) {
              const sky = neighbor.getSkylight(lx, y, lz);
              if (sky > 0) this.pushLightQueue(skyQueue, wx, y, wz);

              const block = neighbor.getBlocklight(lx, y, lz);
              if (block > 0) this.pushLightQueue(blockQueue, wx, y, wz);
            }
          }
        }
      }
    }

    this.propagateSkylightQueue(skyQueue);
    this.propagateBlocklightQueue(blockQueue);
    this.borderReconcileTimeMs += performance.now() - metricsStart;
  }


  private pushLightQueue(queue: number[], x: number, y: number, z: number): void {
    queue.push(x, y, z);
    if (this.metricsEnabled) this.queuePushes++;
  }

  private pushRemoveQueue(queue: number[], x: number, y: number, z: number, val: number): void {
    queue.push(x, y, z, val);
    if (this.metricsEnabled) this.removeQueuePushes++;
  }

}
