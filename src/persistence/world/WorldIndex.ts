import { GameMode } from '../../player/GameMode';
import type { WorldStorage } from '../storage/WorldStorage';

export interface WorldIndexEntry {
  readonly worldId: string;
  readonly displayName: string;
  readonly gameMode: GameMode;
  readonly seed: string;
  readonly createdAt: number;
  readonly lastPlayedAt: number;
  readonly saveVersion: number;
  readonly generatorVersion: string;
}

export interface WorldIndex {
  readonly version: number;
  readonly worlds: readonly WorldIndexEntry[];
}

const INDEX_WORLD = '__global__';
const INDEX_KEY = 'world-index.json';
const INDEX_VERSION = 1;

export async function readWorldIndex(storage: WorldStorage): Promise<WorldIndex> {
  const bytes = await storage.get(INDEX_WORLD, INDEX_KEY);
  if (bytes === undefined) return { version: INDEX_VERSION, worlds: [] };
  const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<WorldIndex>;
  const worlds = Array.isArray(parsed.worlds) ? parsed.worlds.filter(isEntry) : [];
  return { version: INDEX_VERSION, worlds };
}

export async function writeWorldIndex(storage: WorldStorage, index: WorldIndex): Promise<void> {
  const sorted = [...index.worlds].sort((a, b) => b.lastPlayedAt - a.lastPlayedAt || a.displayName.localeCompare(b.displayName) || a.worldId.localeCompare(b.worldId));
  await storage.put(INDEX_WORLD, INDEX_KEY, new TextEncoder().encode(JSON.stringify({ version: INDEX_VERSION, worlds: sorted })));
}

export async function upsertWorldIndexEntry(storage: WorldStorage, entry: WorldIndexEntry): Promise<void> {
  const index = await readWorldIndex(storage);
  await writeWorldIndex(storage, { version: INDEX_VERSION, worlds: [...index.worlds.filter((world) => world.worldId !== entry.worldId), entry] });
}

export async function removeWorldIndexEntry(storage: WorldStorage, worldId: string): Promise<void> {
  const index = await readWorldIndex(storage);
  await writeWorldIndex(storage, { version: INDEX_VERSION, worlds: index.worlds.filter((world) => world.worldId !== worldId) });
}

export function sanitizeWorldId(displayName: string): string {
  const normalized = displayName.trim().toLowerCase().normalize('NFKD').replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized.length > 0 ? normalized.slice(0, 48) : 'world';
}

export function uniqueWorldId(baseName: string, existingIds: Iterable<string>): string {
  const base = sanitizeWorldId(baseName);
  const used = new Set(existingIds);
  if (!used.has(base)) return base;
  for (let i = 1; i < 10_000; i++) {
    const candidate = `${base}-${i}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error('Unable to create a unique world id.');
}

function isEntry(value: unknown): value is WorldIndexEntry {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.worldId === 'string'
    && typeof record.displayName === 'string'
    && typeof record.seed === 'string'
    && typeof record.createdAt === 'number'
    && typeof record.lastPlayedAt === 'number';
}
