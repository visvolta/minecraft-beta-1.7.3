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
  /**
   * Nether portals. Beta draws them in alpha render pass 1 alongside other
   * blended terrain; they sit above the fluids so a portal remains visible
   * through water/lava surfaces.
   */
  portal: 23,
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

/**
 * Forces an entity material into three.js's OPAQUE render queue.
 *
 * This is the root cause of "entities disappear through water". three.js
 * partitions objects into an opaque queue and a transparent queue *before* it
 * sorts by `renderOrder`, and it always draws the whole opaque queue first.
 * A material with `transparent: true` therefore lands in the transparent
 * queue and is drawn AFTER the water depth pre-pass (which is opaque,
 * `colorWrite: false`), no matter how low its `renderOrder` is. The pre-pass
 * has already stamped the water surface into the depth buffer, so the entity
 * fails the depth test and vanishes.
 *
 * Entity textures are binary cut-outs (skin, mob, item sprites): they need
 * `alphaTest`, not alpha blending. Clearing `transparent` keeps the cut-out
 * behaviour, moves the material into the opaque queue, and lets `renderOrder`
 * actually order it against the pre-pass. Depth testing stays fully enabled.
 */
export function useOpaqueEntityQueue(material: {
  transparent: boolean;
  alphaTest: number;
  depthWrite: boolean;
  depthTest: boolean;
  needsUpdate: boolean;
}): void {
  // A cut-out needs a non-zero alphaTest; without one, clearing `transparent`
  // would render the texture's fully transparent texels as solid black.
  if (material.alphaTest <= 0) material.alphaTest = 0.1;
  material.transparent = false;
  material.depthWrite = true;
  material.depthTest = true;
  material.needsUpdate = true;
}
