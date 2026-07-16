export enum WorldEventType {
  LavaIgnitionAttempt = 1,
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
