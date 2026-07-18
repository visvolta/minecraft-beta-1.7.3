export enum WorldEventType {
  LavaIgnitionAttempt = 1,
  TntIgniteAttempt = 2,
  ItemDrop = 3,
}

export interface LavaIgnitionAttemptEvent {
  readonly type: WorldEventType.LavaIgnitionAttempt;
  readonly eventId: number;
  readonly worldTick: number;
  readonly lavaX: number;
  readonly lavaY: number;
  readonly lavaZ: number;
  readonly candidateX: number;
  readonly candidateY: number;
  readonly candidateZ: number;
  readonly lavaBlockId: number;
  readonly lavaMetadata: number;
  readonly randomValue: number;
}

export interface TntIgniteAttemptEvent {
  readonly type: WorldEventType.TntIgniteAttempt;
  readonly eventId: number;
  readonly worldTick: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface ItemDropEvent {
  readonly type: WorldEventType.ItemDrop;
  readonly eventId: number;
  readonly worldTick: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly itemId: number;
  readonly metadata: number;
  readonly count: number;
  readonly source: string;
}
