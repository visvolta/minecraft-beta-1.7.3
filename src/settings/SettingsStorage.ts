import type { WorldStorage } from '../persistence/storage/WorldStorage';
import { DEFAULT_GAME_SETTINGS, validateGameSettings, type GameSettings } from './GameSettings';

const SETTINGS_WORLD = '__global__';
const SETTINGS_KEY = 'settings.json';

export async function loadGameSettings(storage: WorldStorage): Promise<GameSettings> {
  const bytes = await storage.get(SETTINGS_WORLD, SETTINGS_KEY);
  if (bytes === undefined) return DEFAULT_GAME_SETTINGS;
  try { return validateGameSettings(JSON.parse(new TextDecoder().decode(bytes))); }
  catch (error) { console.warn('[SettingsStorage] Invalid settings, using defaults.', error); return DEFAULT_GAME_SETTINGS; }
}

export async function saveGameSettings(storage: WorldStorage, settings: GameSettings): Promise<void> {
  await storage.put(SETTINGS_WORLD, SETTINGS_KEY, new TextEncoder().encode(JSON.stringify(settings)));
}
