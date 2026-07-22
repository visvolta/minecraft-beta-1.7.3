import type { BlockId } from '../blocks/BlockId';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { BlockBehaviourContext, BlockBehaviourRegistry } from './BlockBehaviour';
import { ALL_BLOCK_DIRECTIONS, offsetBlockPosition, oppositeDirection, type BlockPosition } from './BlockDirections';
import type { ChunkManager } from './ChunkManager';
import { CHUNK_SIZE_Y } from './chunkConstants';
import type { WorldEventQueue } from './events/WorldEventQueue';
import type { LightEngine } from './generation/lighting/LightEngine';
import { getBoundaryNeighbourChunks, worldToChunkLocal } from './worldToChunkCoords';
import type { RedstonePowerEngine } from './redstone/RedstonePowerEngine';
import type { BlockMutationEvent, NeighbourUpdateEvent } from './updates/BlockMutation';
import { NeighbourUpdateQueue, type NeighbourQueueMetrics, type NeighbourUpdateQueueOptions } from './updates/NeighbourUpdateQueue';

export type BlockUpdateReason = 'player' | 'scheduled' | 'neighbour' | 'world' | 'chunk-load';

export interface SetBlockOptions {
  readonly metadata?: number;
  readonly reason?: BlockUpdateReason;
  readonly notifyNeighbours?: boolean;
  readonly updateLighting?: boolean;
  readonly player?: unknown;
}

export interface SetBlockMetadataOptions {
  readonly affectsMesh?: boolean;
  readonly affectsWeather?: boolean;
  readonly affectsLight?: boolean;
  readonly notifyNeighbours?: boolean;
  readonly reason?: BlockUpdateReason;
}

/** Authoritative world mutation gateway and owner of the neighbour FIFO. */
export class BlockUpdateWorld {
  private readonly neighbourUpdates: NeighbourUpdateQueue;
  private scheduleCallback: ((x: number, y: number, z: number, blockId: BlockId, delayTicks: number) => boolean) | undefined;
  private behaviourRegistry: BlockBehaviourRegistry | undefined;
  private eventQueue: WorldEventQueue | undefined;
  private powerEngine: RedstonePowerEngine | undefined;
  private getGameTick: (() => number) | undefined;
  private getNextInt: ((bound: number) => number) | undefined;
  private nextGenerationId = 1;
  private nextMutationId = 1;
  private activeGenerationId: number | undefined;
  private activeDepth = 0;

  public constructor(
    private readonly chunkManager: ChunkManager,
    private readonly blockRegistry: BlockRegistry,
    private readonly lightEngine: LightEngine,
    neighbourQueueOptions: NeighbourUpdateQueueOptions = {},
  ) {
    this.neighbourUpdates = new NeighbourUpdateQueue(neighbourQueueOptions);
  }

  public setScheduleCallback(callback: (x: number, y: number, z: number, blockId: BlockId, delayTicks: number) => boolean): void {
    this.scheduleCallback = callback;
  }

  public setBehaviourRegistry(registry: BlockBehaviourRegistry): void {
    this.behaviourRegistry = registry;
  }

  public setEventQueue(queue: WorldEventQueue): void {
    this.eventQueue = queue;
  }

  public setPowerEngine(powerEngine: RedstonePowerEngine): void {
    this.powerEngine = powerEngine;
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

  public isNormalCube(worldX: number, worldY: number, worldZ: number): boolean {
    if (!this.isLoaded(worldX, worldZ) || worldY < 0 || worldY >= CHUNK_SIZE_Y) return false;
    const definition = this.blockRegistry.getById(this.getBlock(worldX, worldY, worldZ));
    return definition !== undefined
      && definition.solid
      && !definition.transparent
      && definition.renderType === 'opaque';
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
    if (worldY < 0 || worldY >= CHUNK_SIZE_Y) return false;
    const { chunkX, chunkZ, localX, localZ } = worldToChunkLocal(worldX, worldZ);
    const chunk = this.chunkManager.getChunk(chunkX, chunkZ);
    if (chunk === undefined) return false;

    const previousBlockId = chunk.getBlock(localX, worldY, localZ);
    const previousMetadata = chunk.getBlockMetadata(localX, worldY, localZ);
    const metadata = this.normalizeMetadata(options.metadata ?? 0);
    if (previousBlockId === blockId && previousMetadata === metadata) return false;

    const mutation = this.createMutation(
      { x: worldX, y: worldY, z: worldZ },
      previousBlockId,
      previousMetadata,
      blockId,
      metadata,
      options.reason ?? 'world',
    );

    chunk.setBlock(localX, worldY, localZ, blockId);
    chunk.setBlockMetadata(localX, worldY, localZ, metadata, {
      affectsMesh: true,
      affectsWeather: false,
      affectsLight: false,
    });

    if (options.updateLighting ?? true) this.lightEngine.handleBlockEdit(worldX, worldY, worldZ);
    this.markBoundaryNeighboursDirty(chunkX, chunkZ, localX, localZ);
    if (options.notifyNeighbours ?? true) this.enqueueMutationNotifications(mutation);

    const registry = this.behaviourRegistry;
    if (registry !== undefined) {
      this.withMutationContext(mutation, () => {
        const ctx = this.createBehaviourContext(options.player);
        if (previousBlockId !== 0 && previousBlockId !== blockId) {
          registry.get(previousBlockId).onRemoved?.(ctx, worldX, worldY, worldZ, previousBlockId);
        }
        if (blockId !== 0 && previousBlockId !== blockId) {
          registry.get(blockId).onPlaced?.(ctx, worldX, worldY, worldZ, blockId);
        } else if (previousBlockId === blockId && previousMetadata !== metadata) {
          registry.get(blockId).stateChanged?.(ctx, mutation);
        }
      });
    }
    return true;
  }

  public setBlockMetadata(
    worldX: number,
    worldY: number,
    worldZ: number,
    metadata: number,
    options: SetBlockMetadataOptions = {},
  ): boolean {
    if (worldY < 0 || worldY >= CHUNK_SIZE_Y) return false;
    const { chunkX, chunkZ, localX, localZ } = worldToChunkLocal(worldX, worldZ);
    const chunk = this.chunkManager.getChunk(chunkX, chunkZ);
    if (chunk === undefined) return false;
    const blockId = chunk.getBlock(localX, worldY, localZ);
    const previousMetadata = chunk.getBlockMetadata(localX, worldY, localZ);
    const normalized = this.normalizeMetadata(metadata);
    if (previousMetadata === normalized) return false;

    const mutation = this.createMutation(
      { x: worldX, y: worldY, z: worldZ },
      blockId,
      previousMetadata,
      blockId,
      normalized,
      options.reason ?? 'world',
    );
    const changed = chunk.setBlockMetadata(localX, worldY, localZ, normalized, options);
    if (!changed) return false;
    if (options.affectsLight === true) this.lightEngine.handleBlockEdit(worldX, worldY, worldZ);
    if (options.affectsMesh ?? true) this.markBoundaryNeighboursDirty(chunkX, chunkZ, localX, localZ);
    if (options.notifyNeighbours === true) this.enqueueMutationNotifications(mutation);
    const registry = this.behaviourRegistry;
    if (registry !== undefined) {
      this.withMutationContext(mutation, () => registry.get(blockId).stateChanged?.(this.createBehaviourContext(), mutation));
    }
    return true;
  }

  /** Completes ordinary neighbour work in the current simulation tick. */
  public drainNeighbourNotifications(callback: (notification: NeighbourUpdateEvent, ctx: BlockBehaviourContext) => void): number {
    return this.neighbourUpdates.drain((notification) => {
      if (!this.isLoaded(notification.receiverPosition.x, notification.receiverPosition.z)) {
        this.neighbourUpdates.recordUnloadedDiscard();
        return;
      }
      this.withUpdateContext(notification.generationId, notification.depth + 1, () => {
        callback(notification, this.createBehaviourContext());
      });
    });
  }

  public getPendingNeighbourUpdateCount(): number {
    return this.neighbourUpdates.size;
  }

  public getNeighbourQueueMetrics(): NeighbourQueueMetrics {
    return this.neighbourUpdates.getMetrics();
  }

  public createTickBehaviourContext(
    gameTick: number,
    nextInt: (bound: number) => number,
    nextLong: () => bigint,
    events?: WorldEventQueue,
  ): BlockBehaviourContext {
    return {
      world: this,
      gameTick,
      nextInt,
      nextLong,
      ...(events === undefined ? {} : { events }),
      ...(this.powerEngine === undefined ? {} : { power: this.powerEngine }),
    };
  }

  public createUpdateGeneration(): number {
    return this.nextGenerationId++;
  }

  /** Synthetic current-state notification used only for targeted chunk-boundary reconciliation. */
  public enqueueBoundaryReconciliation(receiver: BlockPosition, source: BlockPosition, generationId: number): boolean {
    const directionToSource = ALL_BLOCK_DIRECTIONS.find((direction) => {
      const candidate = offsetBlockPosition(receiver, direction);
      return candidate.x === source.x && candidate.y === source.y && candidate.z === source.z;
    });
    if (directionToSource === undefined || !this.isLoaded(receiver.x, receiver.z)) return false;
    const sourceState = {
      blockId: this.getBlock(source.x, source.y, source.z),
      metadata: this.getBlockMetadata(source.x, source.y, source.z),
    };
    return this.neighbourUpdates.enqueue({
      generationId,
      mutationId: this.nextMutationId++,
      sourcePosition: source,
      receiverPosition: receiver,
      previousState: sourceState,
      currentState: sourceState,
      directionToSource,
      reason: 'chunk-load',
      depth: 0,
    });
  }

  private createMutation(
    sourcePosition: BlockPosition,
    previousBlockId: BlockId,
    previousMetadata: number,
    currentBlockId: BlockId,
    currentMetadata: number,
    reason: BlockUpdateReason,
  ): BlockMutationEvent {
    return {
      generationId: this.activeGenerationId ?? this.nextGenerationId++,
      mutationId: this.nextMutationId++,
      sourcePosition,
      previousState: { blockId: previousBlockId, metadata: previousMetadata },
      currentState: { blockId: currentBlockId, metadata: currentMetadata },
      reason,
      depth: this.activeDepth,
    };
  }

  private enqueueMutationNotifications(mutation: BlockMutationEvent): void {
    for (const sourceToReceiverDirection of ALL_BLOCK_DIRECTIONS) {
      const receiver = offsetBlockPosition(mutation.sourcePosition, sourceToReceiverDirection);
      if (receiver.y < 0 || receiver.y >= CHUNK_SIZE_Y) continue;
      if (!this.isLoaded(receiver.x, receiver.z)) {
        this.neighbourUpdates.recordUnloadedDiscard();
        continue;
      }
      this.neighbourUpdates.enqueue({
        ...mutation,
        receiverPosition: receiver,
        directionToSource: oppositeDirection(sourceToReceiverDirection),
      });
    }
  }

  private createBehaviourContext(player?: unknown): BlockBehaviourContext {
    return {
      world: this,
      gameTick: this.getGameTick?.() ?? 0,
      ...(this.getNextInt === undefined ? {} : { nextInt: this.getNextInt }),
      ...(this.eventQueue === undefined ? {} : { events: this.eventQueue }),
      ...(this.powerEngine === undefined ? {} : { power: this.powerEngine }),
      ...(player === undefined ? {} : { player }),
    } as BlockBehaviourContext;
  }

  private withMutationContext(mutation: BlockMutationEvent, callback: () => void): void {
    this.withUpdateContext(mutation.generationId, mutation.depth + 1, callback);
  }

  private withUpdateContext(generationId: number, depth: number, callback: () => void): void {
    const previousGeneration = this.activeGenerationId;
    const previousDepth = this.activeDepth;
    this.activeGenerationId = generationId;
    this.activeDepth = depth;
    try {
      callback();
    } finally {
      this.activeGenerationId = previousGeneration;
      this.activeDepth = previousDepth;
    }
  }

  private markBoundaryNeighboursDirty(chunkX: number, chunkZ: number, localX: number, localZ: number): void {
    for (const neighbour of getBoundaryNeighbourChunks(chunkX, chunkZ, localX, localZ)) {
      this.chunkManager.getChunk(neighbour.chunkX, neighbour.chunkZ)?.markDirty();
    }
  }

  private normalizeMetadata(metadata: number): number {
    if (!Number.isFinite(metadata)) return 0;
    return Math.max(0, Math.min(15, Math.trunc(metadata)));
  }
}
