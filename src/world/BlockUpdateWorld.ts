import type { BlockId } from '../blocks/BlockId';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { ChunkManager } from './ChunkManager';
import type { LightEngine } from './generation/lighting/LightEngine';
import { CHUNK_SIZE_Y } from './chunkConstants';
import { getBoundaryNeighbourChunks, worldToChunkLocal } from './worldToChunkCoords';
import type { BlockBehaviourRegistry } from './BlockBehaviour';
import type { WorldEventQueue } from './events/WorldEventQueue';

export type BlockUpdateReason = 'player' | 'scheduled' | 'neighbour' | 'world';

export interface SetBlockOptions {
  readonly metadata?: number;
  readonly reason?: BlockUpdateReason;
  readonly notifyNeighbours?: boolean;
  readonly updateLighting?: boolean;
}

export interface NeighbourNotification {
  readonly sourceX: number;
  readonly sourceY: number;
  readonly sourceZ: number;
  readonly targetX: number;
  readonly targetY: number;
  readonly targetZ: number;
  readonly reason: BlockUpdateReason;
}

const NEIGHBOUR_OFFSETS: ReadonlyArray<readonly [number, number, number]> = [
  [0, -1, 0],
  [0, 1, 0],
  [0, 0, -1],
  [0, 0, 1],
  [-1, 0, 0],
  [1, 0, 0],
];

/**
 * Narrow world mutation gateway. Behaviour systems own decisions; this
 * class only applies block/metadata changes and coordinates invalidation,
 * lighting, neighbour notification and chunk-border dirtiness.
 * Now also dispatches onPlaced/onRemoved callbacks via behaviour registry.
 */
export class BlockUpdateWorld {
  private readonly pendingNeighbourUpdates: NeighbourNotification[] = [];
  private scheduleCallback: ((x: number, y: number, z: number, blockId: BlockId, delayTicks: number) => boolean) | undefined;
  private readonly pendingNeighbourKeys = new Set<string>();
  private behaviourRegistry?: BlockBehaviourRegistry;
  private eventQueue?: WorldEventQueue;
  private getGameTick?: () => number;
  private getNextInt?: (bound: number) => number;

  public constructor(
    private readonly chunkManager: ChunkManager,
    private readonly blockRegistry: BlockRegistry,
    private readonly lightEngine: LightEngine,
  ) {}

  public setScheduleCallback(callback: (x: number, y: number, z: number, blockId: BlockId, delayTicks: number) => boolean): void {
    this.scheduleCallback = callback;
  }

  public setBehaviourRegistry(registry: BlockBehaviourRegistry): void {
    this.behaviourRegistry = registry;
  }

  public setEventQueue(queue: WorldEventQueue): void {
    this.eventQueue = queue;
  }

  public setGameTickProvider(provider: () => number): void {
    this.getGameTick = provider;
  }

  public setNextIntProvider(provider: (bound: number) => number): void {
    this.getNextInt = provider;
  }

  public scheduleBlockTick(worldX: number, worldY: number, worldZ: number, blockId: BlockId, delayTicks: number): boolean {
    return this.scheduleCallback?.(worldX, worldY, worldZ, blockId, delayTicks) ?? false;
  }

  public getBlock(worldX: number, worldY: number, worldZ: number): BlockId {
    if (worldY < 0 || worldY >= CHUNK_SIZE_Y) return 0;
    const { chunkX, chunkZ, localX, localZ } = worldToChunkLocal(worldX, worldZ);
    return this.chunkManager.getChunk(chunkX, chunkZ)?.getBlock(localX, worldY, localZ) ?? 0;
  }

  public getBlockMetadata(worldX: number, worldY: number, worldZ: number): number {
    if (worldY < 0 || worldY >= CHUNK_SIZE_Y) return 0;
    const { chunkX, chunkZ, localX, localZ } = worldToChunkLocal(worldX, worldZ);
    return this.chunkManager.getChunk(chunkX, chunkZ)?.getBlockMetadata(localX, worldY, localZ) ?? 0;
  }

  public isLoaded(worldX: number, worldZ: number): boolean {
    const { chunkX, chunkZ } = worldToChunkLocal(worldX, worldZ);
    return this.chunkManager.hasChunk(chunkX, chunkZ);
  }

  /** Runtime generators must not force streaming; all touched chunks must already exist. */
  public areChunksLoadedAround(worldX: number, worldZ: number, radiusChunks: number): boolean {
    const { chunkX, chunkZ } = worldToChunkLocal(worldX, worldZ);
    for (let dz = -radiusChunks; dz <= radiusChunks; dz++) for (let dx = -radiusChunks; dx <= radiusChunks; dx++) {
      if (!this.chunkManager.hasChunk(chunkX + dx, chunkZ + dz)) return false;
    }
    return true;
  }

  public getBlocklight(worldX: number, worldY: number, worldZ: number): number {
    return this.lightEngine.getBlocklight(worldX, worldY, worldZ);
  }

  public getSkylight(worldX: number, worldY: number, worldZ: number): number {
    return this.lightEngine.getSkylight(worldX, worldY, worldZ);
  }

  public setBlock(worldX: number, worldY: number, worldZ: number, blockId: BlockId, options: SetBlockOptions = {}): boolean {
    if (worldY < 0 || worldY >= CHUNK_SIZE_Y) {
      return false;
    }

    const { chunkX, chunkZ, localX, localZ } = worldToChunkLocal(worldX, worldZ);
    const chunk = this.chunkManager.getChunk(chunkX, chunkZ);
    if (chunk === undefined) {
      return false;
    }

    const previousBlockId = chunk.getBlock(localX, worldY, localZ);
    const previousMetadata = chunk.getBlockMetadata(localX, worldY, localZ);
    const metadata = options.metadata ?? 0;

    if (previousBlockId === blockId && previousMetadata === metadata) {
      return false;
    }

    chunk.setBlock(localX, worldY, localZ, blockId);
    chunk.setBlockMetadata(localX, worldY, localZ, metadata, {
      affectsMesh: true,
      affectsWeather: false,
      affectsLight: false,
    });

    if (options.updateLighting ?? true) {
      this.lightEngine.handleBlockEdit(worldX, worldY, worldZ);
    }

    for (const neighbour of getBoundaryNeighbourChunks(chunkX, chunkZ, localX, localZ)) {
      this.chunkManager.getChunk(neighbour.chunkX, neighbour.chunkZ)?.markDirty();
    }

    if (options.notifyNeighbours ?? true) {
      this.enqueueNeighbourNotifications(worldX, worldY, worldZ, options.reason ?? 'world');
    }

    // Dispatch removal and placement callbacks via behaviour registry
    if (this.behaviourRegistry) {
      const gameTick = this.getGameTick ? this.getGameTick() : 0;
      const ctx = {
        world: this,
        gameTick,
        nextInt: this.getNextInt,
        events: this.eventQueue,
      } as any;

      if (previousBlockId !== 0 && previousBlockId !== blockId) {
        try {
          this.behaviourRegistry.get(previousBlockId).onRemoved?.(ctx, worldX, worldY, worldZ, previousBlockId);
        } catch (e) {
          console.warn('onRemoved failed', e);
        }
      }
      if (blockId !== 0 && previousBlockId !== blockId) {
        try {
          this.behaviourRegistry.get(blockId).onPlaced?.(ctx, worldX, worldY, worldZ, blockId);
        } catch (e) {
          console.warn('onPlaced failed', e);
        }
      }
    }

    void this.blockRegistry;
    return true;
  }

  public setBlockMetadata(
    worldX: number,
    worldY: number,
    worldZ: number,
    metadata: number,
    options: { readonly affectsMesh?: boolean; readonly affectsWeather?: boolean; readonly affectsLight?: boolean } = {},
  ): boolean {
    if (worldY < 0 || worldY >= CHUNK_SIZE_Y) {
      return false;
    }
    const { chunkX, chunkZ, localX, localZ } = worldToChunkLocal(worldX, worldZ);
    const chunk = this.chunkManager.getChunk(chunkX, chunkZ);
    if (chunk === undefined) {
      return false;
    }
    const changed = chunk.setBlockMetadata(localX, worldY, localZ, metadata, options);
    if (changed && options.affectsLight === true) {
      this.lightEngine.handleBlockEdit(worldX, worldY, worldZ);
    }
    return changed;
  }

  public drainNeighbourNotifications(limit: number, callback: (notification: NeighbourNotification) => void): number {
    let processed = 0;
    while (processed < limit && this.pendingNeighbourUpdates.length > 0) {
      const notification = this.pendingNeighbourUpdates.shift()!;
      this.pendingNeighbourKeys.delete(this.key(notification));
      callback(notification);
      processed += 1;
    }
    return processed;
  }

  public getPendingNeighbourUpdateCount(): number {
    return this.pendingNeighbourUpdates.length;
  }

  private enqueueNeighbourNotifications(sourceX: number, sourceY: number, sourceZ: number, reason: BlockUpdateReason): void {
    for (const [dx, dy, dz] of NEIGHBOUR_OFFSETS) {
      const targetY = sourceY + dy;
      if (targetY < 0 || targetY >= CHUNK_SIZE_Y) {
        continue;
      }
      const notification: NeighbourNotification = {
        sourceX,
        sourceY,
        sourceZ,
        targetX: sourceX + dx,
        targetY,
        targetZ: sourceZ + dz,
        reason,
      };
      const key = this.key(notification);
      if (this.pendingNeighbourKeys.has(key)) {
        continue;
      }
      this.pendingNeighbourKeys.add(key);
      this.pendingNeighbourUpdates.push(notification);
    }
  }

  private key(notification: NeighbourNotification): string {
    return `${notification.sourceX},${notification.sourceY},${notification.sourceZ}->${notification.targetX},${notification.targetY},${notification.targetZ}:${notification.reason}`;
  }
}
