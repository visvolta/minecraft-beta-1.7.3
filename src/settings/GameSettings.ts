import { Difficulty } from '../world/Difficulty';
import type { InputAction } from '../input/Input';
import { normalizeGuiScale, type GuiScaleSetting } from '../ui/GuiScale';

export interface GameSettings {
  readonly version: 1;
  readonly audio: { readonly master: number; readonly music: number; readonly sound: number };
  readonly mouse: { readonly sensitivity: number; readonly invertY: boolean };
  readonly video: { readonly viewBobbing: boolean; readonly guiScale: GuiScaleSetting };
  readonly controls: { readonly bindings: Readonly<Record<InputAction, readonly string[]>> };
  readonly gameplay: { readonly difficulty: Difficulty };
}

export const DEFAULT_KEY_BINDINGS: Readonly<Record<InputAction, readonly string[]>> = {
  forward: ['KeyW'],
  back: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  inventory: ['KeyE'],
  drop: ['KeyQ'],
  pause: ['Escape'],
  perspective: ['KeyP'],
};

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  version: 1,
  audio: { master: 1, music: 1, sound: 1 },
  mouse: { sensitivity: 0.5, invertY: false },
  video: { viewBobbing: true, guiScale: 0 },
  controls: { bindings: DEFAULT_KEY_BINDINGS },
  gameplay: { difficulty: Difficulty.Normal },
};

export function validateGameSettings(value: unknown): GameSettings {
  const source = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  const audio = typeof source.audio === 'object' && source.audio !== null ? source.audio as Record<string, unknown> : {};
  const mouse = typeof source.mouse === 'object' && source.mouse !== null ? source.mouse as Record<string, unknown> : {};
  const video = typeof source.video === 'object' && source.video !== null ? source.video as Record<string, unknown> : {};
  const gameplay = typeof source.gameplay === 'object' && source.gameplay !== null ? source.gameplay as Record<string, unknown> : {};
  const controls = typeof source.controls === 'object' && source.controls !== null ? source.controls as Record<string, unknown> : {};
  const bindingsSource = typeof controls.bindings === 'object' && controls.bindings !== null ? controls.bindings as Record<string, unknown> : {};
  const bindings: Record<InputAction, readonly string[]> = { ...DEFAULT_KEY_BINDINGS };
  for (const key of Object.keys(DEFAULT_KEY_BINDINGS) as InputAction[]) {
    const raw = bindingsSource[key];
    if (Array.isArray(raw) && raw.every((entry) => typeof entry === 'string') && raw.length > 0) bindings[key] = raw;
  }
  const difficulty = gameplay.difficulty;
  return {
    version: 1,
    audio: {
      master: clamp(typeof audio.master === 'number' ? audio.master : DEFAULT_GAME_SETTINGS.audio.master, 0, 1),
      music: clamp(typeof audio.music === 'number' ? audio.music : DEFAULT_GAME_SETTINGS.audio.music, 0, 1),
      sound: clamp(typeof audio.sound === 'number' ? audio.sound : DEFAULT_GAME_SETTINGS.audio.sound, 0, 1),
    },
    mouse: {
      sensitivity: clamp(typeof mouse.sensitivity === 'number' ? mouse.sensitivity : DEFAULT_GAME_SETTINGS.mouse.sensitivity, 0, 1),
      invertY: typeof mouse.invertY === 'boolean' ? mouse.invertY : DEFAULT_GAME_SETTINGS.mouse.invertY,
    },
    video: {
      viewBobbing: typeof video.viewBobbing === 'boolean' ? video.viewBobbing : DEFAULT_GAME_SETTINGS.video.viewBobbing,
      guiScale: normalizeGuiScale(video.guiScale),
    },
    controls: { bindings },
    gameplay: { difficulty: difficulty === Difficulty.Peaceful || difficulty === Difficulty.Easy || difficulty === Difficulty.Normal || difficulty === Difficulty.Hard ? difficulty : Difficulty.Normal },
  };
}

export function updateBinding(settings: GameSettings, action: InputAction, code: string): GameSettings {
  return { ...settings, controls: { bindings: { ...settings.controls.bindings, [action]: [code] } } };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
