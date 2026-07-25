/**
 * Pure world-id helpers for the new persistence system (relocated from the
 * deleted legacy world-index module). The world index itself is owned by the
 * storage backend (`listWorlds`/`upsertWorld`/`deleteWorld`); only these string
 * helpers are retained.
 */

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
