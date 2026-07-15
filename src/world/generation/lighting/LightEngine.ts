import { worldToChunkLocal } from '../../worldToChunkCoords';
import type { ChunkManager } from '../../ChunkManager';
import type { BlockRegistry } from '../../../blocks/BlockRegistry';
import type { Chunk } from '../../Chunk';
import { CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z } from '../../chunkConstants';

interface QueueNode {
  x: number;
  y: number;
  z: number;
}

interface RemoveNode {
  x: number;
  y: number;
  z: number;
  val: number;
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

  public constructor(chunkManager: ChunkManager, blockRegistry: BlockRegistry) {
    this.chunkManager = chunkManager;
    this.blockRegistry = blockRegistry;
  }

  // ==========================================
  // Getters & Setters (Absolute World Space)
  // ==========================================

  public getBlock(x: number, y: number, z: number): number {
    if (y < 0 || y >= CHUNK_SIZE_Y) return 0;
    const { chunkX, chunkZ, localX, localZ } = worldToChunkLocal(x, z);
    const chunk = this.chunkManager.getChunk(chunkX, chunkZ);
    return chunk ? chunk.getBlock(localX, y, localZ) : 0;
  }

  public getSkylight(x: number, y: number, z: number): number {
    if (y < 0 || y >= CHUNK_SIZE_Y) return 15; // Void above gets full skylight
    const { chunkX, chunkZ, localX, localZ } = worldToChunkLocal(x, z);
    const chunk = this.chunkManager.getChunk(chunkX, chunkZ);
    return chunk ? chunk.getSkylight(localX, y, localZ) : 15;
  }

  public setSkylight(x: number, y: number, z: number, val: number): void {
    if (y < 0 || y >= CHUNK_SIZE_Y) return;
    const { chunkX, chunkZ, localX, localZ } = worldToChunkLocal(x, z);
    const chunk = this.chunkManager.getChunk(chunkX, chunkZ);
    if (chunk) {
      chunk.setSkylight(localX, y, localZ, val);
      chunk.markDirty();
    }
  }

  public getBlocklight(x: number, y: number, z: number): number {
    if (y < 0 || y >= CHUNK_SIZE_Y) return 0;
    const { chunkX, chunkZ, localX, localZ } = worldToChunkLocal(x, z);
    const chunk = this.chunkManager.getChunk(chunkX, chunkZ);
    return chunk ? chunk.getBlocklight(localX, y, localZ) : 0;
  }

  public setBlocklight(x: number, y: number, z: number, val: number): void {
    if (y < 0 || y >= CHUNK_SIZE_Y) return;
    const { chunkX, chunkZ, localX, localZ } = worldToChunkLocal(x, z);
    const chunk = this.chunkManager.getChunk(chunkX, chunkZ);
    if (chunk) {
      chunk.setBlocklight(localX, y, localZ, val);
      chunk.markDirty();
    }
  }

  public getOpacity(x: number, y: number, z: number): number {
    const blockId = this.getBlock(x, y, z);
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
    const startX = chunk.chunkX * CHUNK_SIZE_X;
    const startZ = chunk.chunkZ * CHUNK_SIZE_Z;

    const skyPropQueue: QueueNode[] = [];
    const blockPropQueue: QueueNode[] = [];

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

        // Below the heightmap, sunlight attenuates vertically by block opacity
        let currentLight = 15;
        for (let y = height - 1; y >= 0; y--) {
          const opacity = this.getOpacity(wx, y, wz);
          currentLight -= Math.max(1, opacity);
          if (currentLight < 0) currentLight = 0;
          chunk.setSkylight(lx, y, lz, currentLight);

          // If there is still light, enqueue it so it can spread horizontally into overhangs/caves
          if (currentLight > 0) {
            skyPropQueue.push({ x: wx, y: y, z: wz });
          }
        }

        // Scan for emissive blocks (blocklight sources)
        for (let y = 0; y < CHUNK_SIZE_Y; y++) {
          const emission = this.getEmission(wx, y, wz);
          if (emission > 0) {
            chunk.setBlocklight(lx, y, lz, emission);
            blockPropQueue.push({ x: wx, y: y, z: wz });
          }
        }
      }
    }

    // 2. Propagate initial skylight and blocklight
    this.propagateSkylightQueue(skyPropQueue);
    this.propagateBlocklightQueue(blockPropQueue);
  }

  // ==========================================
  // Propagation Routines (Queue-Based)
  // ==========================================

  public propagateSkylightQueue(queue: QueueNode[]): void {
    let head = 0;
    while (head < queue.length) {
      const node = queue[head++]!;
      const cx = node.x;
      const cy = node.y;
      const cz = node.z;
      const currentLight = this.getSkylight(cx, cy, cz);

      for (const { dx, dy, dz } of NEIGHBORS) {
        const nx = cx + dx;
        const ny = cy + dy;
        const nz = cz + dz;

        if (ny < 0 || ny >= CHUNK_SIZE_Y) continue;

        const opacity = this.getOpacity(nx, ny, nz);
        const expected = currentLight - Math.max(1, opacity);
        const target = this.getSkylight(nx, ny, nz);

        if (expected > target) {
          this.setSkylight(nx, ny, nz, expected);
          queue.push({ x: nx, y: ny, z: nz });
        }
      }
    }
  }

  public propagateBlocklightQueue(queue: QueueNode[]): void {
    let head = 0;
    while (head < queue.length) {
      const node = queue[head++]!;
      const cx = node.x;
      const cy = node.y;
      const cz = node.z;
      const currentLight = this.getBlocklight(cx, cy, cz);

      for (const { dx, dy, dz } of NEIGHBORS) {
        const nx = cx + dx;
        const ny = cy + dy;
        const nz = cz + dz;

        if (ny < 0 || ny >= CHUNK_SIZE_Y) continue;

        const opacity = this.getOpacity(nx, ny, nz);
        const expected = currentLight - Math.max(1, opacity);
        const target = this.getBlocklight(nx, ny, nz);

        if (expected > target) {
          this.setBlocklight(nx, ny, nz, expected);
          queue.push({ x: nx, y: ny, z: nz });
        }
      }
    }
  }

  // ==========================================
  // Local Relighting on Block Edit (Break/Place)
  // ==========================================

  /**
   * Calculates local relighting after a block change.
   * Employs both a removal queue and a propagation queue to achieve perfect local updates.
   */
  public handleBlockEdit(wx: number, wy: number, wz: number): void {
    // We update both skylight and blocklight around the edited coordinate
    this.updateLocalLight('sky', wx, wy, wz);
    this.updateLocalLight('block', wx, wy, wz);
  }

  private updateLocalLight(type: 'sky' | 'block', wx: number, wy: number, wz: number): void {
    const isSky = type === 'sky';
    const oldLight = isSky ? this.getSkylight(wx, wy, wz) : this.getBlocklight(wx, wy, wz);

    // Calculate new base value at the coordinate itself
    let newLight = 0;
    if (isSky) {
      const { chunkX, chunkZ, localX, localZ } = worldToChunkLocal(wx, wz);
      const chunk = this.chunkManager.getChunk(chunkX, chunkZ);
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
      const removeQueue: RemoveNode[] = [];
      const propQueue: QueueNode[] = [];

      removeQueue.push({ x: wx, y: wy, z: wz, val: oldLight });

      let head = 0;
      while (head < removeQueue.length) {
        const node = removeQueue[head++]!;
        const cx = node.x;
        const cy = node.y;
        const cz = node.z;
        const oldVal = node.val;

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
            removeQueue.push({ x: nx, y: ny, z: nz, val: neighborLight });
          } else if (neighborLight > 0) {
            // This neighbor is brighter and survived, enqueue it to light back the darkened region
            propQueue.push({ x: nx, y: ny, z: nz });
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
      const propQueue: QueueNode[] = [{ x: wx, y: wy, z: wz }];
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
   * Reconciles borders between a newly loaded chunk and its loaded neighbors.
   */
  public reconcileChunkBorders(chunk: Chunk): void {
    const startX = chunk.chunkX * CHUNK_SIZE_X;
    const startZ = chunk.chunkZ * CHUNK_SIZE_Z;

    const skyQueue: QueueNode[] = [];
    const blockQueue: QueueNode[] = [];

    // Scan boundary block columns and enqueue any border transitions that can propagate
    for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
        // Only check boundaries of the chunk (lx === 0, lx === 15, lz === 0, lz === 15)
        const isBorder = lx === 0 || lx === CHUNK_SIZE_X - 1 || lz === 0 || lz === CHUNK_SIZE_Z - 1;
        if (!isBorder) continue;

        const wx = startX + lx;
        const wz = startZ + lz;

        for (let y = 0; y < CHUNK_SIZE_Y; y++) {
          const sky = chunk.getSkylight(lx, y, lz);
          if (sky > 0) skyQueue.push({ x: wx, y: y, z: wz });

          const block = chunk.getBlocklight(lx, y, lz);
          if (block > 0) blockQueue.push({ x: wx, y: y, z: wz });
        }
      }
    }

    this.propagateSkylightQueue(skyQueue);
    this.propagateBlocklightQueue(blockQueue);
  }
}
