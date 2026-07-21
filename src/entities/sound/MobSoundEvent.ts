export type MobSoundKind = 'ambient' | 'hurt' | 'death' | 'step' | 'attack' | 'bow' | 'fuse' | 'egg'|'eat'|'pickup'|'itemBreak';

export interface MobSoundEvent {
  readonly id: string;
  readonly kind: MobSoundKind;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly volume: number;
  readonly pitch: number;
  readonly attenuationDistance: number;
}
