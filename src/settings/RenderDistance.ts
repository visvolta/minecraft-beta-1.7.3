/**
 * Render distance: the single authoritative definition of how far the world
 * streams and draws.
 *
 * There is deliberately NO mutable module-level radius constant here. The
 * value flows one way:
 *
 *   GameSettings.video.renderDistance
 *     -> Engine applies it to ChunkStreamer (the runtime owner)
 *     -> FogController / renderer consumers receive it explicitly
 *
 * Anything that needs the live radius asks the ChunkStreamer (or is handed the
 * number), so there is exactly one runtime source of truth and no global that
 * merely looks like the old `CHUNK_LOAD_RADIUS` constant.
 *
 * Render distance is a PRESENTATION/STREAMING setting only. It must not change
 * mob spawning radius, random-tick radius or entity simulation, so lowering it
 * for frame rate never changes how the world behaves.
 */

/** Selectable render distances, in chunks (Chebyshev radius around the camera). */
export const RENDER_DISTANCE_OPTIONS = [2, 4, 6, 8] as const;

export type RenderDistance = (typeof RENDER_DISTANCE_OPTIONS)[number];

/** Matches the project's historical hard-coded load radius. */
export const DEFAULT_RENDER_DISTANCE: RenderDistance = 6;

/**
 * Extra rings kept resident beyond the load radius before a chunk is unloaded.
 *
 * The gap is what stops a player standing on a chunk boundary from repeatedly
 * loading and unloading the same ring. It also gives a render-distance
 * REDUCTION somewhere to land: chunks between the new load radius and the new
 * unload radius are allowed to linger rather than being dropped the instant
 * the setting changes.
 */
export const UNLOAD_HYSTERESIS_CHUNKS = 1;

/** Unload radius for a given render distance (2->3, 4->5, 6->7, 8->9). */
export function unloadRadiusFor(renderDistance: number): number {
  return renderDistance + UNLOAD_HYSTERESIS_CHUNKS;
}

/** Chunks in the fully loaded square at a given render distance. */
export function loadedChunkCountFor(renderDistance: number): number {
  const side = renderDistance * 2 + 1;
  return side * side;
}

/** True when `value` is one of the selectable options. */
export function isRenderDistance(value: unknown): value is RenderDistance {
  return typeof value === 'number' && (RENDER_DISTANCE_OPTIONS as readonly number[]).includes(value);
}

/**
 * Coerces arbitrary persisted input to a valid option.
 *
 * Settings blobs written before this setting existed (and any hand-edited
 * value) must still load, so an unknown number snaps to the nearest option
 * rather than failing or silently resetting to the default.
 */
export function normalizeRenderDistance(value: unknown): RenderDistance {
  if (isRenderDistance(value)) return value;
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_RENDER_DISTANCE;
  let best: RenderDistance = RENDER_DISTANCE_OPTIONS[0];
  let bestDelta = Math.abs(value - best);
  for (const option of RENDER_DISTANCE_OPTIONS) {
    const delta = Math.abs(value - option);
    if (delta < bestDelta) {
      best = option;
      bestDelta = delta;
    }
  }
  return best;
}

/** Next option in the cycle, for the settings screen button. */
export function nextRenderDistance(current: number): RenderDistance {
  const normalized = normalizeRenderDistance(current);
  const index = RENDER_DISTANCE_OPTIONS.indexOf(normalized);
  return RENDER_DISTANCE_OPTIONS[(index + 1) % RENDER_DISTANCE_OPTIONS.length]!;
}

/** Label for the settings button and F3 line. */
export function renderDistanceLabel(value: number): string {
  return `${normalizeRenderDistance(value)} Chunks`;
}
