import type { BlockRegistry } from '../../blocks/BlockRegistry';
import type { FaceDirection } from '../../blocks/BlockFace';
import type { BlockBehaviourRegistry } from '../BlockBehaviour';
import { ALL_BLOCK_DIRECTIONS, offsetBlockPosition, oppositeDirection, type BlockPosition } from '../BlockDirections';
import type { BlockUpdateWorld } from '../BlockUpdateWorld';
import {
  clampRedstonePower,
  NO_REDSTONE_POWER,
  type PowerQueryContext,
  type ReadonlyPowerWorld,
  type RedstonePower,
} from './RedstonePower';

export interface RedstonePowerMetrics {
  readonly weakQueries: number;
  readonly strongQueries: number;
  readonly indirectQueries: number;
  readonly unloadedQueries: number;
}

/** Pure on-demand Beta-style weak/strong power query service. */
export class RedstonePowerEngine {
  private weakQueries = 0;
  private strongQueries = 0;
  private indirectQueries = 0;
  private unloadedQueries = 0;
  private readonly readWorld: ReadonlyPowerWorld;

  public constructor(
    private readonly world: BlockUpdateWorld,
    private readonly blocks: BlockRegistry,
    private readonly behaviours: BlockBehaviourRegistry,
  ) {
    this.readWorld = {
      getBlock: (x, y, z) => this.world.getBlock(x, y, z),
      getBlockMetadata: (x, y, z) => this.world.getBlockMetadata(x, y, z),
      isLoaded: (x, z) => this.world.isLoaded(x, z),
      isNormalCube: (x, y, z) => this.isNormalCube({ x, y, z }),
    };
  }

  public getWeakPowerFrom(receiver: BlockPosition, directionToSource: FaceDirection): RedstonePower {
    this.weakQueries++;
    const context = this.createContext(receiver, directionToSource);
    if (context === undefined) return NO_REDSTONE_POWER;
    const behaviour = this.behaviours.get(context.sourceBlockId);
    if (behaviour.canProvidePower !== true || behaviour.getWeakPower === undefined) return NO_REDSTONE_POWER;
    return clampRedstonePower(behaviour.getWeakPower(context));
  }

  public getStrongPowerFrom(receiver: BlockPosition, directionToSource: FaceDirection): RedstonePower {
    this.strongQueries++;
    const context = this.createContext(receiver, directionToSource);
    if (context === undefined) return NO_REDSTONE_POWER;
    const behaviour = this.behaviours.get(context.sourceBlockId);
    if (behaviour.canProvidePower !== true || behaviour.getStrongPower === undefined) return NO_REDSTONE_POWER;
    return clampRedstonePower(behaviour.getStrongPower(context));
  }

  public getMaximumNeighbourWeakPower(position: BlockPosition): RedstonePower {
    let maximum = NO_REDSTONE_POWER;
    for (const direction of ALL_BLOCK_DIRECTIONS) {
      maximum = clampRedstonePower(Math.max(maximum, this.getWeakPowerFrom(position, direction)));
      if (maximum === 15) break;
    }
    return maximum;
  }

  public getMaximumNeighbourStrongPower(position: BlockPosition): RedstonePower {
    let maximum = NO_REDSTONE_POWER;
    for (const direction of ALL_BLOCK_DIRECTIONS) {
      maximum = clampRedstonePower(Math.max(maximum, this.getStrongPowerFrom(position, direction)));
      if (maximum === 15) break;
    }
    return maximum;
  }

  /** Beta World.isBlockGettingPowered(): adjacent source strong-power hooks only. */
  public getDirectPowerAt(position: BlockPosition): RedstonePower {
    return this.getMaximumNeighbourStrongPower(position);
  }

  public isBlockDirectlyPowered(position: BlockPosition): boolean {
    return this.getDirectPowerAt(position) > 0;
  }

  /**
   * Beta World.isBlockIndirectlyProvidingPowerTo(): a normal cube exposes only
   * strong power received from its immediate neighbours; it does not recurse
   * through another normal cube. Non-cubes expose their own weak output.
   */
  public getIndirectPowerFrom(receiver: BlockPosition, directionToSource: FaceDirection): RedstonePower {
    this.indirectQueries++;
    const source = offsetBlockPosition(receiver, directionToSource);
    if (!this.isPositionLoaded(source)) return NO_REDSTONE_POWER;
    return this.isNormalCube(source)
      ? this.getDirectPowerAt(source)
      : this.getWeakPowerFrom(receiver, directionToSource);
  }

  public getMaximumIndirectPower(position: BlockPosition): RedstonePower {
    let maximum = NO_REDSTONE_POWER;
    for (const direction of ALL_BLOCK_DIRECTIONS) {
      maximum = clampRedstonePower(Math.max(maximum, this.getIndirectPowerFrom(position, direction)));
      if (maximum === 15) break;
    }
    return maximum;
  }

  public isBlockIndirectlyPowered(position: BlockPosition): boolean {
    return this.getMaximumIndirectPower(position) > 0;
  }

  public getMaximumPowerAround(position: BlockPosition): RedstonePower {
    return this.getMaximumIndirectPower(position);
  }

  public getMetrics(): RedstonePowerMetrics {
    return {
      weakQueries: this.weakQueries,
      strongQueries: this.strongQueries,
      indirectQueries: this.indirectQueries,
      unloadedQueries: this.unloadedQueries,
    };
  }

  private createContext(receiver: BlockPosition, directionToSource: FaceDirection): PowerQueryContext | undefined {
    const source = offsetBlockPosition(receiver, directionToSource);
    if (!this.isPositionLoaded(source)) return undefined;
    const sourceBlockId = this.world.getBlock(source.x, source.y, source.z);
    return {
      world: this.readWorld,
      receiverPosition: receiver,
      sourcePosition: source,
      directionToSource,
      sourceOutputFace: oppositeDirection(directionToSource),
      sourceBlockId,
      sourceMetadata: this.world.getBlockMetadata(source.x, source.y, source.z),
    };
  }

  private isPositionLoaded(position: BlockPosition): boolean {
    const loaded = position.y >= 0 && position.y < 128 && this.world.isLoaded(position.x, position.z);
    if (!loaded) this.unloadedQueries++;
    return loaded;
  }

  private isNormalCube(position: BlockPosition): boolean {
    if (!this.isPositionLoaded(position)) return false;
    const definition = this.blocks.getById(this.world.getBlock(position.x, position.y, position.z));
    return definition !== undefined
      && definition.solid
      && !definition.transparent
      && definition.renderType === 'opaque';
  }
}
