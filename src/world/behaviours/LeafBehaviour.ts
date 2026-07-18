/**
 * Beta 1.7.3 leaf decay — faithful port of BlockLeaves.
 *
 * Metadata:
 *  - bits 0-1 (&3) species: 0 oak, 1 spruce/pine, 2 birch
 *  - bit 3 (8) decay-check flag
 * Helpers in leafUtils preserve all bits except 8 when setting/clearing.
 *
 * Behaviour:
 *  - onBlockRemoval (leaf): marks 3x3x3 leaves with decay flag if chunks exist in -2..+2 box.
 *  - randomTick: if decay flag set, checkChunksExist -5..+5, then BFS radius 4 orthogonal from logs.
 *    If connected → clear flag, else remove leaf + 1/20 sapling drop (species preserved).
 *  - onPlaced: clears decay flag for player-placed persistent leaves (deviation documented).
 *
 * No global scans, bounded BFS using Int16Array 9x9x9 = 729 entries reused per tick via local allocation
 * (small, not string-keyed Map). Max nodes visited tracked for metrics.
 */

import { BlockIds } from '../../blocks/BlockId';
import type { BlockId } from '../../blocks/BlockId';
import type { BlockBehaviour, BlockBehaviourContext, BlockBehaviourRegistry } from '../BlockBehaviour';
import {
  isLeafBlock,
  isLogBlock,
  getLeafSpecies,
  hasLeafDecayFlag,
  setLeafDecayFlag,
  getSaplingMetadataForLeafSpecies,
} from '../../blocks/leafUtils';
import { CHUNK_SIZE_Y } from '../chunkConstants';

interface LeafMetrics {
  randomTicksProcessed: number;
  markedChecked: number;
  markedLeafRandomTicks: number;
  preserved: number;
  cleared: number;
  decayed: number;
  decayedLeaves: number;
  connectedChecks: number;
  saplingsDropped: number;
  skippedMissingChunks: number;
  maxNodesVisited: number;
  pendingChecks: number;
  leafRemovalCallbacks: number;
  leavesMarkedByLeafRemoval: number;
}

const SEARCH_RADIUS = 4;
const CHECK_RADIUS = 5; // Beta checks -5..+5 block box for chunk existence
const LEAF_MARK_RADIUS = 1; // leaf removal marks 3x3x3

// Reusable directions for 6 orthogonal neighbours
const DIRS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

function checkChunksExist(world: BlockBehaviourContext['world'], x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): boolean {
  // Beta: checks if chunks exist for the given block box. We approximate by checking X/Z chunk range.
  // Y is ignored for chunk existence but clamp to world height for safety.
  const minChunkX = Math.floor(Math.min(x1, x2) / 16);
  const maxChunkX = Math.floor(Math.max(x1, x2) / 16);
  const minChunkZ = Math.floor(Math.min(z1, z2) / 16);
  const maxChunkZ = Math.floor(Math.max(z1, z2) / 16);
  for (let cx = minChunkX; cx <= maxChunkX; cx++) {
    for (let cz = minChunkZ; cz <= maxChunkZ; cz++) {
      // Use world.isLoaded which checks ChunkManager.hasChunk
      const sampleX = cx * 16;
      const sampleZ = cz * 16;
      if (!world.isLoaded(sampleX, sampleZ)) {
        return false;
      }
    }
  }
  // Also check Y bounds: if box entirely outside world, treat as not loaded? Beta would have height check? We'll allow.
  if (Math.max(y1, y2) < 0 || Math.min(y1, y2) >= CHUNK_SIZE_Y) {
    return false;
  }
  return true;
}

export class LeafBehaviour implements BlockBehaviour {
  public readonly randomTicks = true;

  private metrics: LeafMetrics = {
    randomTicksProcessed: 0,
    markedChecked: 0,
    markedLeafRandomTicks: 0,
    preserved: 0,
    cleared: 0,
    decayed: 0,
    decayedLeaves: 0,
    connectedChecks: 0,
    saplingsDropped: 0,
    skippedMissingChunks: 0,
    maxNodesVisited: 0,
    pendingChecks: 0,
    leafRemovalCallbacks: 0,
    leavesMarkedByLeafRemoval: 0,
  };

  public getMetrics(): LeafMetrics {
    return { ...this.metrics };
  }

  public resetMetrics(): void {
    this.metrics = {
      randomTicksProcessed: 0,
      markedChecked: 0,
      markedLeafRandomTicks: 0,
      preserved: 0,
      cleared: 0,
      decayed: 0,
      decayedLeaves: 0,
      connectedChecks: 0,
      saplingsDropped: 0,
      skippedMissingChunks: 0,
      maxNodesVisited: 0,
      pendingChecks: 0,
      leafRemovalCallbacks: 0,
      leavesMarkedByLeafRemoval: 0,
    };
  }

  public onPlaced(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    // Beta ItemLeaves.getPlacedBlockMetadata returns damage|8, so placed leaves get decay flag.
    // Restore Beta behaviour: placed leaves receive decay bit 8, preserved other bits.
    // Do NOT clear bit 8 here.
    const meta = ctx.world.getBlockMetadata(x, y, z);
    if (!hasLeafDecayFlag(meta)) {
      const flagged = setLeafDecayFlag(meta, true);
      ctx.world.setBlockMetadata(x, y, z, flagged, { affectsMesh: true, affectsWeather: true, affectsLight: false });
    }
  }

  public onRemoved(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    this.metrics.leafRemovalCallbacks++;
    // BlockLeaves.onBlockRemoval: marks 3x3x3 leaves
    if (!checkChunksExist(ctx.world, x - 2, y - 2, z - 2, x + 2, y + 2, z + 2)) {
      this.metrics.skippedMissingChunks++;
      return;
    }
    for (let dx = -LEAF_MARK_RADIUS; dx <= LEAF_MARK_RADIUS; dx++) {
      for (let dy = -LEAF_MARK_RADIUS; dy <= LEAF_MARK_RADIUS; dy++) {
        for (let dz = -LEAF_MARK_RADIUS; dz <= LEAF_MARK_RADIUS; dz++) {
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
          this.metrics.leavesMarkedByLeafRemoval++;
        }
      }
    }
  }

  public randomTick(ctx: BlockBehaviourContext, x: number, y: number, z: number, blockId: BlockId): void {
    this.metrics.randomTicksProcessed++;

    const meta = ctx.world.getBlockMetadata(x, y, z);
    if (!hasLeafDecayFlag(meta)) {
      return;
    }

    this.metrics.markedChecked++;
    this.metrics.markedLeafRandomTicks++;

    // Guard: checkChunksExist -5..+5 (Beta) — must verify chunks intersecting the block box are loaded
    if (!checkChunksExist(ctx.world, x - CHECK_RADIUS, y - CHECK_RADIUS, z - CHECK_RADIUS, x + CHECK_RADIUS, y + CHECK_RADIUS, z + CHECK_RADIUS)) {
      this.metrics.skippedMissingChunks++;
      return;
    }

    // Perform connectivity search radius 4
    const result = this.checkConnectivity(ctx, x, y, z);
    this.metrics.connectedChecks++;
    if (result.connected) {
      // Clear decay flag
      const cleared = setLeafDecayFlag(meta, false);
      ctx.world.setBlockMetadata(x, y, z, cleared, { affectsMesh: true, affectsWeather: true, affectsLight: false });
      this.metrics.preserved++;
      this.metrics.cleared++;
      if (result.nodesVisited > this.metrics.maxNodesVisited) {
        this.metrics.maxNodesVisited = result.nodesVisited;
      }
    } else {
      // Decay
      const species = getLeafSpecies(blockId, meta);
      // 1 in 20 sapling drop
      const shouldDrop = ctx.nextInt ? ctx.nextInt(20) === 0 : Math.random() < 0.05;
      if (shouldDrop) {
        const saplingMeta = getSaplingMetadataForLeafSpecies(species);
        ctx.events?.enqueueItemDrop(
          ctx.gameTick,
          x,
          y,
          z,
          BlockIds.Sapling,
          saplingMeta,
          1,
          'leaf-decay',
        );
        this.metrics.saplingsDropped++;
      }
      // Remove leaf
      ctx.world.setBlock(x, y, z, BlockIds.Air, {
        reason: 'world',
        notifyNeighbours: true,
        updateLighting: true,
      });
      this.metrics.decayed++;
      this.metrics.decayedLeaves++;
      if (result.nodesVisited > this.metrics.maxNodesVisited) {
        this.metrics.maxNodesVisited = result.nodesVisited;
      }
    }
  }

  /**
   * Checks if leaf at (cx,cy,cz) is connected to a log within 4 orthogonal steps.
   * Returns {connected, nodesVisited}
   * Uses bounded BFS with fixed-size array 9x9x9 (729) — allocation-light.
   * No string-keyed Map.
   */
  private checkConnectivity(ctx: BlockBehaviourContext, cx: number, cy: number, cz: number): { connected: boolean; nodesVisited: number } {
    // 9x9x9 cube centred at leaf: offset -4..4
    const SIZE = 9;
    const HALF = 4;
    const VOLUME = SIZE * SIZE * SIZE;
    // Use Int16Array for distances: -1 = blocked/other, -2 = leaf to check, 0..4 = distance from log
    const dist = new Int16Array(VOLUME);
    // Initialize to -1
    for (let i = 0; i < VOLUME; i++) dist[i] = -1;

    const idx = (ox: number, oy: number, oz: number): number => {
      // ox,oy,oz in -4..4
      return (ox + HALF) * SIZE * SIZE + (oy + HALF) * SIZE + (oz + HALF);
    };

    // First pass: fill initial values
    let nodesVisited = 0;
    for (let ox = -SEARCH_RADIUS; ox <= SEARCH_RADIUS; ox++) {
      for (let oy = -SEARCH_RADIUS; oy <= SEARCH_RADIUS; oy++) {
        for (let oz = -SEARCH_RADIUS; oz <= SEARCH_RADIUS; oz++) {
          const wx = cx + ox;
          const wy = cy + oy;
          const wz = cz + oz;
          if (wy < 0 || wy >= CHUNK_SIZE_Y) {
            dist[idx(ox, oy, oz)] = -1;
            continue;
          }
          const bid = ctx.world.getBlock(wx, wy, wz);
          if (isLogBlock(bid)) {
            dist[idx(ox, oy, oz)] = 0;
          } else if (isLeafBlock(bid)) {
            dist[idx(ox, oy, oz)] = -2;
          } else {
            dist[idx(ox, oy, oz)] = -1;
          }
        }
      }
    }

    // BFS from distance 0 outward up to 4
    // Use simple queue array of indices (max 729)
    const queue: number[] = [];
    // Seed queue with all distance 0 (logs)
    for (let ox = -SEARCH_RADIUS; ox <= SEARCH_RADIUS; ox++) {
      for (let oy = -SEARCH_RADIUS; oy <= SEARCH_RADIUS; oy++) {
        for (let oz = -SEARCH_RADIUS; oz <= SEARCH_RADIUS; oz++) {
          const i = idx(ox, oy, oz);
          if (dist[i] === 0) {
            queue.push(i);
          }
        }
      }
    }

    let qHead = 0;
    while (qHead < queue.length) {
      const curIdx = queue[qHead++]!;
      const curDist = dist[curIdx]!;
      if (curDist >= SEARCH_RADIUS) continue; // don't propagate beyond 4
      // Decode ox,oy,oz from index for neighbour checks
      // To avoid expensive division, we could store positions, but 729 is small so decode via loops?
      // We'll decode via arithmetic
      const tmp = curIdx;
      const oz = (tmp % SIZE) - HALF;
      const oy = (Math.floor(tmp / SIZE) % SIZE) - HALF;
      const ox = Math.floor(tmp / (SIZE * SIZE)) - HALF;

      nodesVisited++;

      for (const [dx, dy, dz] of DIRS) {
        const nox = ox + dx;
        const noy = oy + dy;
        const noz = oz + dz;
        if (nox < -SEARCH_RADIUS || nox > SEARCH_RADIUS) continue;
        if (noy < -SEARCH_RADIUS || noy > SEARCH_RADIUS) continue;
        if (noz < -SEARCH_RADIUS || noz > SEARCH_RADIUS) continue;
        const nIdx = idx(nox, noy, noz);
        if (dist[nIdx] === -2) {
          dist[nIdx] = curDist + 1;
          queue.push(nIdx);
          if (queue.length > VOLUME) break; // safety
        }
      }
    }

    // Centre leaf is at offset 0,0,0
    const centreIdx = idx(0, 0, 0);
    const centreDist = dist[centreIdx]!;
    // In Beta, centre distance is -2 initially if leaf, then if found becomes 0..4
    const connected = centreDist >= 0;

    // Special case: centre might be -2 but if there is adjacent log directly, BFS would have set it.
    // So check.

    return { connected, nodesVisited: nodesVisited + queue.length };
  }
}

export function registerLeafBehaviour(registry: BlockBehaviourRegistry): LeafBehaviour {
  const behaviour = new LeafBehaviour();
  const leafIds = [
    BlockIds.Leaves,
    (BlockIds as any).SpruceLeaves ?? 253,
    (BlockIds as any).BirchLeaves ?? 250,
    250,
    253,
  ];
  for (const id of leafIds) {
    if (id !== undefined) registry.register(id, behaviour);
  }
  return behaviour;
}
