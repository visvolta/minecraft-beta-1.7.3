import type { BlockId } from '../blocks/BlockId';
import type { BlockUpdateWorld } from './BlockUpdateWorld';
import type { WorldEventQueue } from './events/WorldEventQueue';
import { AABB } from '../physics/AABB';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { PowerQueryContext, RedstonePower } from './redstone/RedstonePower';
import type { RedstonePowerEngine } from './redstone/RedstonePowerEngine';
import type { BlockMutationEvent, NeighbourUpdateEvent } from './updates/BlockMutation';

import type { EntityManager } from '../entities/core/EntityManager';

export type BoundingBoxType = 'collision' | 'selection' | 'interaction';

export interface BlockBehaviourContext {
  readonly world: BlockUpdateWorld;
  readonly gameTick: number;
  /** World-owned deterministic RNG, used for Beta random decisions. */
  readonly nextInt?: (bound: number) => number;
  /** Same world RNG stream; required by Beta WorldGenBigTree. */
  readonly nextLong?: () => bigint;
  readonly events?: WorldEventQueue;
  readonly power?: RedstonePowerEngine;
  readonly entities?: EntityManager;
}

export interface BlockBehaviour {
  readonly randomTicks?: boolean;
  readonly isClimbable?: boolean;
  readonly canProvidePower?: boolean;
  readonly requiresNeighbourReconciliation?: boolean;
  getWeakPower?(ctx: PowerQueryContext): RedstonePower | number;
  getStrongPower?(ctx: PowerQueryContext): RedstonePower | number;
  scheduledTick?(ctx: BlockBehaviourContext, x: number, y: number, z: number, blockId: BlockId): void;
  randomTick?(ctx: BlockBehaviourContext, x: number, y: number, z: number, blockId: BlockId): void;
  neighborChanged?(ctx: BlockBehaviourContext, x: number, y: number, z: number, sourceX: number, sourceY: number, sourceZ: number, event?: NeighbourUpdateEvent): void;
  stateChanged?(ctx: BlockBehaviourContext, event: BlockMutationEvent): void;
  canPlaceBlockAt?(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean;
  onPlaced?(ctx: BlockBehaviourContext, x: number, y: number, z: number, blockId: BlockId): void;
  onRemoved?(ctx: BlockBehaviourContext, x: number, y: number, z: number, oldBlockId: BlockId): void;
  onInteract?(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean;
  onEntityCollidedWithBlock?(ctx: BlockBehaviourContext, x: number, y: number, z: number, entityAABB: AABB): void;
  getBoundingBoxes?(ctx: BlockBehaviourContext, x: number, y: number, z: number, type: BoundingBoxType): AABB[] | undefined;
}

const NOOP_BEHAVIOUR: BlockBehaviour = {};

export class BlockBehaviourRegistry {
  private readonly behaviours = new Map<BlockId, BlockBehaviour>();

  public register(blockId: BlockId, behaviour: BlockBehaviour): void {
    this.behaviours.set(blockId, behaviour);
  }

  public get(blockId: BlockId): BlockBehaviour {
    return this.behaviours.get(blockId) ?? NOOP_BEHAVIOUR;
  }

  public requiresNeighbourReconciliation(blockId: BlockId): boolean {
    const behaviour = this.get(blockId);
    return behaviour.requiresNeighbourReconciliation === true
      || behaviour.neighborChanged !== undefined
      || behaviour.canProvidePower === true;
  }
}

export function getBlockBounds(
  registry: BlockRegistry,
  behaviours: BlockBehaviourRegistry,
  world: BlockUpdateWorld,
  x: number, y: number, z: number,
  type: BoundingBoxType
): AABB[] {
  const blockId = world.getBlock(x, y, z);
  if (blockId === 0) return [];
  const behaviour = behaviours.get(blockId);
  if (behaviour.getBoundingBoxes) {
    const ctx: BlockBehaviourContext = { world, gameTick: 0 };
    const bounds = behaviour.getBoundingBoxes(ctx, x, y, z, type);
    if (bounds !== undefined) return bounds;
  }
  const def = registry.getById(blockId);
  if (type === 'collision' && (!def || !def.solid)) return [];
  return [new AABB(x, y, z, x + 1, y + 1, z + 1)];
}
