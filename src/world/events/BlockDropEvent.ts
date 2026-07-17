import type { BlockId } from '../../blocks/BlockId';

export interface BlockDropEvent {
  readonly eventId: number;
  readonly gameTick: number;
  readonly sourceEntityId: number;
  readonly blockId: BlockId;
  readonly metadata: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly reason: 'placement_failed' | 'lifetime_expired';
}
