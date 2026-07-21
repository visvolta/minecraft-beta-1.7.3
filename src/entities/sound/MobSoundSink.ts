import type { MobSoundEvent } from './MobSoundEvent';

export interface MobSoundSink { emit(event: MobSoundEvent): void; }
export class NullMobSoundSink implements MobSoundSink { public emit(_event: MobSoundEvent): void {} }
export class CountingMobSoundSink implements MobSoundSink {
  public readonly events: MobSoundEvent[] = [];
  public emit(event: MobSoundEvent): void { this.events.push(event); }
  public count(id: string): number { return this.events.filter(event => event.id === id).length; }
  public reset(): void { this.events.length = 0; }
}
