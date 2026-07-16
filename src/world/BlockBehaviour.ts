import type { BlockId } from '../blocks/BlockId';
import type { BlockUpdateWorld } from './BlockUpdateWorld';
import type { WorldEventQueue } from './events/WorldEventQueue';

export interface BlockBehaviourContext {
  readonly world: BlockUpdateWorld;
  readonly gameTick: number;
  readonly events?: WorldEventQueue;
}

export interface BlockBehaviour {
  readonly randomTicks?: boolean;
  scheduledTick?(ctx: BlockBehaviourContext, x: number, y: number, z: number, blockId: BlockId): void;
  randomTick?(ctx: BlockBehaviourContext, x: number, y: number, z: number, blockId: BlockId): void;
  neighborChanged?(ctx: BlockBehaviourContext, x: number, y: number, z: number, sourceX: number, sourceY: number, sourceZ: number): void;
  onPlaced?(ctx: BlockBehaviourContext, x: number, y: number, z: number, blockId: BlockId): void;
  onRemoved?(ctx: BlockBehaviourContext, x: number, y: number, z: number, oldBlockId: BlockId): void;
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

  public hasRandomTick(blockId: BlockId): boolean {
    return this.get(blockId).randomTicks === true && this.get(blockId).randomTick !== undefined;
  }
}
