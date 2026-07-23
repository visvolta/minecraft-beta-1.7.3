export interface AudioSettings { readonly master: number; readonly music: number; readonly sound: number; }
export const DEFAULT_AUDIO_SETTINGS: AudioSettings = { master: 1, music: 1, sound: 1 };
export function toGain(value: number): number { const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)); return clamped === 0 ? 0 : clamped * clamped; }
