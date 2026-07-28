/**
 * Canonical portal orientation.
 *
 * A Nether portal plane always lies along one horizontal axis: the portal
 * blocks extend along X (frame posts on the X sides) or along Z. Beta derives
 * this ad hoc in several places — `BlockPortal.setBlockBoundsBasedOnState`,
 * `tryToCreatePortal`, `onNeighborBlockChange`, `randomDisplayTick` and the
 * teleporter all re-test neighbouring block ids independently.
 *
 * This module exists so every subsystem (frame validation, collision bounds,
 * meshing, particles, teleport placement) consumes ONE representation. Doors,
 * stairs and signs previously suffered from duplicated orientation logic
 * drifting apart; portals must not repeat that.
 */

/** The horizontal axis the portal plane runs along. */
export const enum PortalAxis {
  /** Plane extends along X; thin in Z. */
  X = 0,
  /** Plane extends along Z; thin in X. */
  Z = 1,
}

/** Half-thickness of the thin side of a portal plane (Beta: 0.125). */
export const PORTAL_THIN_HALF_EXTENT = 0.125;

/** Half-extent along the portal plane (Beta: 0.5, i.e. the full block). */
export const PORTAL_PLANE_HALF_EXTENT = 0.5;

/** Unit step along the portal plane for the given axis. */
export function portalAxisStep(axis: PortalAxis): { readonly dx: number; readonly dz: number } {
  return axis === PortalAxis.X ? { dx: 1, dz: 0 } : { dx: 0, dz: 1 };
}

/**
 * Local (0..1) block bounds for a portal block of this orientation.
 *
 * Matches `BlockPortal.setBlockBoundsBasedOnState`: full height, full width
 * along the plane, and 2 x 0.125 thick across it.
 */
export function portalLocalBounds(axis: PortalAxis): {
  readonly minX: number; readonly minY: number; readonly minZ: number;
  readonly maxX: number; readonly maxY: number; readonly maxZ: number;
} {
  const halfX = axis === PortalAxis.X ? PORTAL_PLANE_HALF_EXTENT : PORTAL_THIN_HALF_EXTENT;
  const halfZ = axis === PortalAxis.X ? PORTAL_THIN_HALF_EXTENT : PORTAL_PLANE_HALF_EXTENT;
  return {
    minX: 0.5 - halfX,
    minY: 0,
    minZ: 0.5 - halfZ,
    maxX: 0.5 + halfX,
    maxY: 1,
    maxZ: 0.5 + halfZ,
  };
}

/**
 * Resolves the axis of an existing portal block from its neighbours.
 *
 * Beta's rule: if neither X neighbour is a portal block the plane must run
 * along Z (thin in X); otherwise it runs along X. A lone portal block (which
 * only exists transiently mid-edit) defaults to X, matching Beta's `else`.
 */
export function resolvePortalAxis(
  isPortalAt: (dx: number, dz: number) => boolean,
): PortalAxis {
  const hasXNeighbour = isPortalAt(-1, 0) || isPortalAt(1, 0);
  return hasXNeighbour ? PortalAxis.X : PortalAxis.Z;
}

/** Human-readable axis name for debug output. */
export function portalAxisName(axis: PortalAxis): string {
  return axis === PortalAxis.X ? 'X' : 'Z';
}
