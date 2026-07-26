import { AABB } from '../../physics/AABB';
import type { LocalBox } from './BlockShapes';

/**
 * Translates unit-cube local shapes into world-space AABBs at a block cell.
 * Keeping this in one place means a behaviour only declares its shape and
 * never repeats the offset arithmetic (a past source of off-by-one bounds).
 */
export function toWorldBounds(boxes: readonly LocalBox[], x: number, y: number, z: number): AABB[] {
  const out: AABB[] = [];
  for (const local of boxes) {
    out.push(new AABB(
      x + local.minX, y + local.minY, z + local.minZ,
      x + local.maxX, y + local.maxY, z + local.maxZ,
    ));
  }
  return out;
}

/** Single-box convenience wrapper. */
export function toWorldBound(local: LocalBox, x: number, y: number, z: number): AABB[] {
  return toWorldBounds([local], x, y, z);
}
