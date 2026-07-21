import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { BlockUpdateWorld } from './BlockUpdateWorld';

/** Loaded-chunk-only voxel ray. Missing chunks are opaque to simulation. */
export function hasLineOfSight(
  world: BlockUpdateWorld,
  blocks: BlockRegistry,
  from: Readonly<{ x: number; y: number; z: number }>,
  to: Readonly<{ x: number; y: number; z: number }>,
): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dy, dz);
  if (length <= 1e-6) return true;
  const steps = Math.ceil(length * 4);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = Math.floor(from.x + dx * t);
    const y = Math.floor(from.y + dy * t);
    const z = Math.floor(from.z + dz * t);
    if (!world.isLoaded(x, z)) return false;
    if (blocks.getById(world.getBlock(x, y, z))?.solid) return false;
  }
  return true;
}
