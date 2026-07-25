/**
 * Beta 1.7.3 BlockLog.onBlockRemoval — marks nearby leaves for decay check.
 *
 * Exact Beta bounds:
 *  - Log removal: var5=4, var6=5, checkChunksExist(x-5..x+5), loop -4..4 (9x9x9)
 *  - Leaf removal (handled in LeafBehaviour): 3x3x3
 *
 * This implementation uses the same block-space check for chunk existence
 * (only chunks intersecting the box) rather than requiring 11x11 chunk area.
 */

import type { BlockBehaviour, BlockBehaviourContext, BlockBehaviourRegistry } from '../BlockBehaviour';
import { BlockIds } from '../../blocks/BlockId';
import { isLeafBlock, hasLeafDecayFlag, setLeafDecayFlag } from '../../blocks/leafUtils';
import { checkChunksExist } from '../../blocks/behaviours/checkChunksExist';
import { CHUNK_SIZE_Y } from '../chunkConstants';

const LOG_MARK_RADIUS = 4;
const LOG_CHECK_RADIUS = 5;

export class LogBehaviour implements BlockBehaviour {
  private metrics = {
    logRemovalCallbacks: 0,
    leavesMarkedByLogRemoval: 0,
    skippedMissingChunks: 0,
  };

  public getMetrics() {
    return { ...this.metrics };
  }

  public resetMetrics() {
    this.metrics = {
      logRemovalCallbacks: 0,
      leavesMarkedByLogRemoval: 0,
      skippedMissingChunks: 0,
    };
  }

  public onRemoved(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    this.metrics.logRemovalCallbacks++;
    // Beta BlockLog.onBlockRemoval
    if (!checkChunksExist(ctx.world, x - LOG_CHECK_RADIUS, y - LOG_CHECK_RADIUS, z - LOG_CHECK_RADIUS, x + LOG_CHECK_RADIUS, y + LOG_CHECK_RADIUS, z + LOG_CHECK_RADIUS)) {
      this.metrics.skippedMissingChunks++;
      return;
    }

    for (let dx = -LOG_MARK_RADIUS; dx <= LOG_MARK_RADIUS; dx++) {
      for (let dy = -LOG_MARK_RADIUS; dy <= LOG_MARK_RADIUS; dy++) {
        for (let dz = -LOG_MARK_RADIUS; dz <= LOG_MARK_RADIUS; dz++) {
          const nx = x + dx;
          const ny = y + dy;
          const nz = z + dz;
          if (ny < 0 || ny >= CHUNK_SIZE_Y) continue;
          const nid = ctx.world.getBlock(nx, ny, nz);
          if (!isLeafBlock(nid)) continue;
          const nmeta = ctx.world.getBlockMetadata(nx, ny, nz);
          if (hasLeafDecayFlag(nmeta)) continue;
          const marked = setLeafDecayFlag(nmeta, true);
          ctx.world.setBlockMetadata(nx, ny, nz, marked, { affectsMesh: true, affectsWeather: true, affectsLight: false });
          this.metrics.leavesMarkedByLogRemoval++;
        }
      }
    }
  }
}

export function registerLogBehaviour(registry: BlockBehaviourRegistry): LogBehaviour {
  const behaviour = new LogBehaviour();
  const logIds = [
    BlockIds.Log,
    (BlockIds as any).SpruceLog ?? 252,
    (BlockIds as any).BirchLog ?? 251,
    251,
    252,
  ];
  for (const id of logIds) {
    if (id !== undefined) registry.register(id, behaviour);
  }
  return behaviour;
}
