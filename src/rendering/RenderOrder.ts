/**
 * Shared render-order layers.
 *
 * Three.js sorts by `renderOrder` first, then by depth. The chunk renderer
 * uses a depth pre-pass for translucent terrain (water, ice, lava): it writes
 * those surfaces into the depth buffer with `colorWrite: false` so the blended
 * pass behind them sorts correctly.
 *
 * That pre-pass is why entities were disappearing under water. Entities
 * defaulted to `renderOrder` 0, so they were drawn *before* the water depth
 * pre-pass; the pre-pass then wrote water depth over them, and the blended
 * water pass covered them completely. Giving entities their own layer between
 * the opaque terrain and the depth pre-pass makes them depth-test against
 * solid geometry (correct) while still being visible through water.
 *
 * Ordering must stay: opaque terrain < cutout < entities < depth pre-pass <
 * blended translucent.
 */
export const RENDER_ORDER = {
  /** Solid chunk geometry. */
  terrain: 0,
  /** Alpha-tested chunk geometry (leaves, rails, torches). */
  cutout: 10,
  /**
   * All world entities and the player. Must sit above cutout terrain and
   * strictly below the translucent depth pre-pass.
   */
  entity: 15,
  /** Depth-only pass for translucent terrain. */
  translucentDepth: 19,
  /** Blended translucent terrain. */
  translucent: 20,
  water: 21,
  lava: 22,
} as const;

/**
 * Applies the entity render layer to an object and everything under it.
 *
 * Called by every entity renderer after building its meshes; centralising it
 * means a new entity type cannot accidentally fall back to layer 0 and vanish
 * behind water.
 */
export function applyEntityRenderOrder(object: {
  renderOrder: number;
  traverse(callback: (node: { renderOrder: number }) => void): void;
}): void {
  object.traverse((node) => {
    node.renderOrder = RENDER_ORDER.entity;
  });
}
