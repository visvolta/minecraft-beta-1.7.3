import { BlockIds } from '../../blocks/BlockId';
import type { BlockId } from '../../blocks/BlockId';
import type { BlockBehaviour, BlockBehaviourContext, BlockBehaviourRegistry } from '../BlockBehaviour';
import { CHUNK_SIZE_Y } from '../chunkConstants';
import { getFluidLevel as getMetadataFluidLevel, isFallingFluid } from './FluidMetadata';

interface FluidConfig {
  readonly flowingId: BlockId;
  readonly stillId: BlockId;
  readonly tickDelay: number;
  readonly decay: number;
  readonly canCreateSources: boolean;
}

const WATER: FluidConfig = {
  flowingId: BlockIds.WaterFlowing,
  stillId: BlockIds.WaterStill,
  tickDelay: 5,
  decay: 1,
  canCreateSources: true,
};

const LAVA: FluidConfig = {
  flowingId: BlockIds.LavaFlowing,
  stillId: BlockIds.LavaStill,
  tickDelay: 30,
  decay: 2,
  canCreateSources: false,
};

const HORIZONTAL: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

function isWater(id: BlockId): boolean {
  return id === BlockIds.WaterFlowing || id === BlockIds.WaterStill;
}

function isLava(id: BlockId): boolean {
  return id === BlockIds.LavaFlowing || id === BlockIds.LavaStill;
}

function isSameFluid(id: BlockId, config: FluidConfig): boolean {
  return id === config.flowingId || id === config.stillId;
}

function isSolidForFlow(id: BlockId): boolean {
  // Focused subset of Beta's material solidity rules. Dynamic blocks added
  // later (doors, signs, ladders, fire, snow) will extend this explicitly.
  if (id === BlockIds.Air) return false;
  if (isWater(id) || isLava(id)) return false;
  switch (id) {
    case BlockIds.Dandelion:
    case BlockIds.Rose:
    case BlockIds.BrownMushroom:
    case BlockIds.RedMushroom:
    case BlockIds.TallGrass:
    case BlockIds.DeadBush:
    case BlockIds.Reed:
      return false;
    default:
      return true;
  }
}

function canFlowInto(ctx: BlockBehaviourContext, x: number, y: number, z: number, config: FluidConfig): boolean {
  if (y < 0 || y >= CHUNK_SIZE_Y || !ctx.world.isLoaded(x, z)) return false;
  const id = ctx.world.getBlock(x, y, z);
  if (isSameFluid(id, config)) return false;
  if (config === WATER && isLava(id)) return false;
  return !isSolidForFlow(id);
}

function getFluidLevel(ctx: BlockBehaviourContext, x: number, y: number, z: number, config: FluidConfig): number {
  const id = ctx.world.getBlock(x, y, z);
  if (!isSameFluid(id, config)) return -1;
  return ctx.world.getBlockMetadata(x, y, z);
}

function normalizedLevel(metadata: number): number {
  return isFallingFluid(metadata) ? 0 : getMetadataFluidLevel(metadata);
}

class FluidBehaviour implements BlockBehaviour {
  public constructor(private readonly config: FluidConfig, private readonly stationary: boolean) {}

  public onPlaced(ctx: BlockBehaviourContext, x: number, y: number, z: number, blockId: BlockId): void {
    if (blockId === this.config.flowingId) {
      ctx.world.scheduleBlockTick(x, y, z, blockId, this.config.tickDelay);
    }
    this.checkLavaInteraction(ctx, x, y, z);
  }

  public neighborChanged(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    const id = ctx.world.getBlock(x, y, z);
    if (!isSameFluid(id, this.config)) return;
    this.checkLavaInteraction(ctx, x, y, z);
    if (this.stationary) {
      const metadata = ctx.world.getBlockMetadata(x, y, z);
      ctx.world.setBlock(x, y, z, this.config.flowingId, {
        metadata,
        reason: 'neighbour',
        notifyNeighbours: true,
        updateLighting: true,
      });
      ctx.world.scheduleBlockTick(x, y, z, this.config.flowingId, this.config.tickDelay);
    } else {
      ctx.world.scheduleBlockTick(x, y, z, this.config.flowingId, this.config.tickDelay);
    }
  }

  public scheduledTick(ctx: BlockBehaviourContext, x: number, y: number, z: number, blockId: BlockId): void {
    if (blockId !== this.config.flowingId) return;
    this.updateFlow(ctx, x, y, z);
  }

  private updateFlow(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    this.checkLavaInteraction(ctx, x, y, z);
    if (ctx.world.getBlock(x, y, z) !== this.config.flowingId) return;
    let level = ctx.world.getBlockMetadata(x, y, z);
    let shouldBecomeStill = true;

    if (level > 0) {
      let adjacentSources = 0;
      let minLevel = -100;
      for (const [dx, dz] of HORIZONTAL) {
        const candidate = getFluidLevel(ctx, x + dx, y, z + dz, this.config);
        if (candidate < 0) continue;
        let normalized = normalizedLevel(candidate);
        if (normalized === 0) adjacentSources += 1;
        minLevel = minLevel < 0 || normalized < minLevel ? normalized : minLevel;
      }

      let newLevel = minLevel + this.config.decay;
      if (newLevel >= 8 || minLevel < 0) newLevel = -1;

      const above = getFluidLevel(ctx, x, y + 1, z, this.config);
      if (above >= 0) newLevel = above >= 8 ? above : above + 8;

      if (this.config.canCreateSources && adjacentSources >= 2) {
        const below = ctx.world.getBlock(x, y - 1, z);
        const belowMeta = ctx.world.getBlockMetadata(x, y - 1, z);
        if (isSolidForFlow(below) || (isSameFluid(below, this.config) && belowMeta === 0)) {
          newLevel = 0;
        }
      }

      if (newLevel !== level) {
        level = newLevel;
        if (level < 0) {
          ctx.world.setBlock(x, y, z, BlockIds.Air, { reason: 'scheduled', notifyNeighbours: true, updateLighting: true });
          return;
        }
        ctx.world.setBlockMetadata(x, y, z, level, { affectsMesh: true, affectsWeather: false, affectsLight: false });
        ctx.world.scheduleBlockTick(x, y, z, this.config.flowingId, this.config.tickDelay);
      } else if (shouldBecomeStill) {
        ctx.world.setBlock(x, y, z, this.config.stillId, { metadata: level, reason: 'scheduled', notifyNeighbours: true, updateLighting: true });
      }
    } else {
      ctx.world.setBlock(x, y, z, this.config.stillId, { metadata: level, reason: 'scheduled', notifyNeighbours: true, updateLighting: true });
    }

    if (canFlowInto(ctx, x, y - 1, z, this.config)) {
      const downLevel = level >= 8 ? level : level + 8;
      this.flowInto(ctx, x, y - 1, z, downLevel);
    } else if (level >= 0 && (level === 0 || isSolidForFlow(ctx.world.getBlock(x, y - 1, z)))) {
      const nextLevel = level >= 8 ? 1 : level + this.config.decay;
      if (nextLevel >= 8) return;
      for (const [dx, dz] of this.chooseFlowDirections(ctx, x, y, z)) {
        this.flowInto(ctx, x + dx, y, z + dz, nextLevel);
      }
    }
  }

  private flowInto(ctx: BlockBehaviourContext, x: number, y: number, z: number, metadata: number): void {
    if (!canFlowInto(ctx, x, y, z, this.config)) return;
    const existing = ctx.world.getBlock(x, y, z);
    if (existing !== BlockIds.Air && existing !== this.config.flowingId) {
      // Item drops/displacement hooks are intentionally deferred.
    }
    ctx.world.setBlock(x, y, z, this.config.flowingId, {
      metadata,
      reason: 'scheduled',
      notifyNeighbours: true,
      updateLighting: true,
    });
    this.checkLavaInteraction(ctx, x, y, z);
    ctx.world.scheduleBlockTick(x, y, z, this.config.flowingId, this.config.tickDelay);
  }

  private chooseFlowDirections(ctx: BlockBehaviourContext, x: number, y: number, z: number): ReadonlyArray<readonly [number, number]> {
    const costs: number[] = [];
    let best = 1000;
    for (const [dx, dz] of HORIZONTAL) {
      let cost = 1000;
      if (!isSolidForFlow(ctx.world.getBlock(x + dx, y, z + dz)) && !isSameFluid(ctx.world.getBlock(x + dx, y, z + dz), this.config)) {
        cost = !isSolidForFlow(ctx.world.getBlock(x + dx, y - 1, z + dz)) ? 0 : this.flowCost(ctx, x + dx, y, z + dz, 1, [-dx, -dz]);
      }
      costs.push(cost);
      best = Math.min(best, cost);
    }
    return HORIZONTAL.filter((_, i) => costs[i] === best);
  }

  private flowCost(ctx: BlockBehaviourContext, x: number, y: number, z: number, depth: number, from: readonly [number, number]): number {
    let best = 1000;
    for (const [dx, dz] of HORIZONTAL) {
      if (dx === from[0] && dz === from[1]) continue;
      const nx = x + dx;
      const nz = z + dz;
      if (isSolidForFlow(ctx.world.getBlock(nx, y, nz)) || isSameFluid(ctx.world.getBlock(nx, y, nz), this.config)) continue;
      if (!isSolidForFlow(ctx.world.getBlock(nx, y - 1, nz))) return depth;
      if (depth < 4) best = Math.min(best, this.flowCost(ctx, nx, y, nz, depth + 1, [-dx, -dz]));
    }
    return best;
  }

  private checkLavaInteraction(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    const id = ctx.world.getBlock(x, y, z);
    if (!isLava(id)) return;
    let touchesWater = false;
    for (const [dx, dz] of HORIZONTAL) touchesWater = touchesWater || isWater(ctx.world.getBlock(x + dx, y, z + dz));
    touchesWater = touchesWater || isWater(ctx.world.getBlock(x, y + 1, z));
    if (!touchesWater) return;
    const metadata = ctx.world.getBlockMetadata(x, y, z);
    if (metadata === 0) {
      ctx.world.setBlock(x, y, z, BlockIds.Obsidian, { reason: 'scheduled', notifyNeighbours: true, updateLighting: true });
    } else if (metadata <= 4) {
      ctx.world.setBlock(x, y, z, BlockIds.Cobblestone, { reason: 'scheduled', notifyNeighbours: true, updateLighting: true });
    }
  }
}

export function registerFluidBehaviours(registry: BlockBehaviourRegistry): void {
  registry.register(BlockIds.WaterFlowing, new FluidBehaviour(WATER, false));
  registry.register(BlockIds.WaterStill, new FluidBehaviour(WATER, true));
  registry.register(BlockIds.LavaFlowing, new FluidBehaviour(LAVA, false));
  registry.register(BlockIds.LavaStill, new FluidBehaviour(LAVA, true));
}
