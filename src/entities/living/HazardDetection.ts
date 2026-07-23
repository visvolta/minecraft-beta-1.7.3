import type { BlockRegistry } from '../../blocks/BlockRegistry';
import type { BlockDefinition } from '../../blocks/BlockDefinition';
import type { BlockUpdateWorld } from '../../world/BlockUpdateWorld';
import type { ChunkManager } from '../../world/ChunkManager';
import { AABB } from '../../physics/AABB';
import { BlockIds } from '../../blocks/BlockId';
import { CHUNK_SIZE_Y } from '../../world/chunkConstants';
import { worldToChunkLocal } from '../../world/worldToChunkCoords';

/**
 * Stateless environmental hazard detection (Beta `handleWaterMovement`,
 * `handleLavaMovement`, `isInsideOfMaterial`, `isEntityInsideOpaqueBlock`).
 *
 * These functions only *detect* conditions from the world; they hold no state
 * and never mutate anything. `LivingEntity` owns all hazard state (fire timer,
 * air supply, burning) and decides damage/state transitions.
 */

export function isWaterBlock(id: number): boolean {
  return id === BlockIds.WaterStill || id === BlockIds.WaterFlowing;
}

export function isLavaBlock(id: number): boolean {
  return id === BlockIds.LavaStill || id === BlockIds.LavaFlowing;
}

export function isFireBlock(id: number): boolean {
  return id === BlockIds.Fire;
}

/** Beta `isOpaqueCube`: a full opaque cube — excludes slabs/stairs/glass/leaves. */
export function isOpaqueFullCube(def: BlockDefinition | undefined): boolean {
  return def !== undefined && def.solid && !def.transparent && def.renderType === 'opaque';
}

/** True if any block cell overlapping `box` satisfies `match`. */
function anyBlockInBox(
  world: BlockUpdateWorld,
  box: AABB,
  match: (id: number) => boolean,
): boolean {
  const minX = Math.floor(box.minX);
  const maxX = Math.floor(box.maxX);
  const minY = Math.max(0, Math.floor(box.minY));
  const maxY = Math.min(CHUNK_SIZE_Y - 1, Math.floor(box.maxY));
  const minZ = Math.floor(box.minZ);
  const maxZ = Math.floor(box.maxZ);
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        if (match(world.getBlock(x, y, z))) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Water contact is determined from the lower body, not the eye point.  This
 * keeps swim physics active until the player's feet have actually cleared the
 * surface while avoiding a full-height query that would make surface swimming
 * feel submerged after leaving the water.
 */
export function isWaterInAABB(world: BlockUpdateWorld, aabb: AABB): boolean {
  const box = new AABB(
    aabb.minX + 0.001, aabb.minY - 0.001, aabb.minZ + 0.001,
    aabb.maxX - 0.001, Math.min(aabb.maxY, aabb.minY + 1), aabb.maxZ - 0.001,
  );
  return anyBlockInBox(world, box, isWaterBlock);
}

/** Beta `handleLavaMovement`: body AABB (expanded) touches lava. */
export function isLavaInAABB(world: BlockUpdateWorld, aabb: AABB): boolean {
  const box = aabb.expand(-0.1, -0.4, -0.1);
  return anyBlockInBox(world, box, isLavaBlock);
}

/** Body AABB intersects a fire block (contact ignition). */
export function isFireInAABB(world: BlockUpdateWorld, aabb: AABB): boolean {
  return anyBlockInBox(world, aabb, isFireBlock);
}

/** Beta `isInsideOfMaterial(water)`: the block at the eye point is water. */
export function isEyeInWater(world: BlockUpdateWorld, eyeX: number, eyeY: number, eyeZ: number): boolean {
  return isWaterBlock(world.getBlock(Math.floor(eyeX), Math.floor(eyeY), Math.floor(eyeZ)));
}

/**
 * Beta `isEntityInsideOpaqueBlock`: sample 8 points around the eye region;
 * suffocate if any lies inside an opaque full cube. The small X/Z spread
 * (width×0.45) and tiny Y spread avoid false positives near slab/stair edges.
 */
export function isInsideOpaqueBlock(
  world: BlockUpdateWorld,
  registry: BlockRegistry,
  eyeX: number,
  eyeY: number,
  eyeZ: number,
  width: number,
): boolean {
  for (let i = 0; i < 8; i++) {
    const ox = ((i % 2) - 0.5) * width * 0.9;
    const oy = (((i >> 1) % 2) - 0.5) * 0.1;
    const oz = (((i >> 2) % 2) - 0.5) * width * 0.9;
    const by = Math.floor(eyeY + oy);
    if (by < 0 || by >= CHUNK_SIZE_Y) {
      continue;
    }
    const id = world.getBlock(Math.floor(eyeX + ox), by, Math.floor(eyeZ + oz));
    if (isOpaqueFullCube(registry.getById(id))) {
      return true;
    }
  }
  return false;
}

/**
 * Sky-exposure for rain extinguishing: the eye is at or above the column's
 * terrain height (nothing solid above it). Falls back to "exposed" if the
 * chunk is unloaded.
 */
export function isExposedToSky(
  chunkManager: ChunkManager,
  x: number,
  eyeY: number,
  z: number,
): boolean {
  const { chunkX, chunkZ, localX, localZ } = worldToChunkLocal(Math.floor(x), Math.floor(z));
  const chunk = chunkManager.getChunk(chunkX, chunkZ);
  if (chunk === undefined) {
    return true;
  }
  return eyeY >= chunk.getHeight(localX, localZ);
}
