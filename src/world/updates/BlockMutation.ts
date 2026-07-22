import type { BlockId } from '../../blocks/BlockId';
import type { FaceDirection } from '../../blocks/BlockFace';
import type { BlockPosition } from '../BlockDirections';
import type { BlockUpdateReason } from '../BlockUpdateWorld';

export interface BlockStateSnapshot {
  readonly blockId: BlockId;
  readonly metadata: number;
}

export interface BlockMutationEvent {
  readonly generationId: number;
  readonly mutationId: number;
  readonly sourcePosition: BlockPosition;
  readonly previousState: BlockStateSnapshot;
  readonly currentState: BlockStateSnapshot;
  readonly reason: BlockUpdateReason;
  readonly depth: number;
}

export interface NeighbourUpdateEvent extends BlockMutationEvent {
  readonly receiverPosition: BlockPosition;
  readonly directionToSource: FaceDirection;
}
