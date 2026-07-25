import type { StorageBackend } from '../persistence2/backend/StorageBackend';
import { DEFAULT_GAME_SETTINGS, validateGameSettings, type GameSettings } from './GameSettings';

/**
 * App settings live in the application-owned backend under a reserved global
 * namespace (world id `__global__`), reusing the backend's generic world-record
 * store. No separate/legacy settings storage stack.
 */
const SETTINGS_WORLD = '__global__';
const SETTINGS_KEY = 'settings.json';

export async function loadGameSettings(backend: StorageBackend): Promise<GameSettings> {
  const bytes = await backend.readRecord(SETTINGS_WORLD, SETTINGS_KEY);
  if (bytes === undefined) return DEFAULT_GAME_SETTINGS;
  try { return validateGameSettings(JSON.parse(new TextDecoder().decode(bytes))); }
  catch (error) { console.warn('[SettingsStorage] Invalid settings, using defaults.', error); return DEFAULT_GAME_SETTINGS; }
}

export async function saveGameSettings(backend: StorageBackend, settings: GameSettings): Promise<void> {
  await backend.writeRecord(SETTINGS_WORLD, SETTINGS_KEY, new TextEncoder().encode(JSON.stringify(settings)));
}
