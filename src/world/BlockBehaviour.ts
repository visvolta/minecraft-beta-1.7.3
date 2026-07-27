import type { BlockId } from '../blocks/BlockId';
import type { BlockUpdateWorld } from './BlockUpdateWorld';
import type { WorldEventQueue } from './events/WorldEventQueue';
import { AABB } from '../physics/AABB';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { PowerQueryContext, RedstonePower } from './redstone/RedstonePower';
import type { RedstonePowerEngine } from './redstone/RedstonePowerEngine';
import type { BlockMutationEvent, NeighbourUpdateEvent } from './updates/BlockMutation';

import type { EntityManager } from '../entities/core/EntityManager';

export type BoundingBoxType = 'collision' | 'selection' | 'interaction';

export interface BlockBehaviourContext {
  readonly world: BlockUpdateWorld;
  readonly gameTick: number;
  /** World-owned deterministic RNG, used for Beta random decisions. */
  readonly nextInt?: (bound: number) => number;
  /** Same world RNG stream; required by Beta WorldGenBigTree. */
  readonly nextLong?: () => bigint;
  readonly events?: WorldEventQueue;
  readonly power?: RedstonePowerEngine;
  readonly entities?: EntityManager;
  /**
   * Positional one-shot sink for block-driven sounds (door hinge, chest lid).
   * Optional so worker-side and headless callers can omit audio entirely.
   */
  readonly playBlockSound?: (id: 'door_open' | 'door_close' | 'chestopen' | 'chestclosed' | 'click', x: number, y: number, z: number) => void;
}

export interface BlockBehaviour {
  readonly randomTicks?: boolean;
  readonly isClimbable?: boolean;
  readonly canProvidePower?: boolean;
  readonly requiresNeighbourReconciliation?: boolean;
  getWeakPower?(ctx: PowerQueryContext): RedstonePower | number;
  getStrongPower?(ctx: PowerQueryContext): RedstonePower | number;
  scheduledTick?(ctx: BlockBehaviourContext, x: number, y: number, z: number, blockId: BlockId): void;
  randomTick?(ctx: BlockBehaviourContext, x: number, y: number, z: number, blockId: BlockId): void;
  neighborChanged?(ctx: BlockBehaviourContext, x: number, y: number, z: number, sourceX: number, sourceY: number, sourceZ: number, event?: NeighbourUpdateEvent): void;
  stateChanged?(ctx: BlockBehaviourContext, event: BlockMutationEvent): void;
  canPlaceBlockAt?(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean;
  onPlaced?(ctx: BlockBehaviourContext, x: number, y: number, z: number, blockId: BlockId): void;
  onRemoved?(ctx: BlockBehaviourContext, x: number, y: number, z: number, oldBlockId: BlockId, oldMetadata?: number): void;
  onInteract?(ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean;
  onEntityCollidedWithBlock?(ctx: BlockBehaviourContext, x: number, y: number, z: number, entityAABB: AABB, entity?: unknown): void;
  getBoundingBoxes?(ctx: BlockBehaviourContext, x: number, y: number, z: number, type: BoundingBoxType): AABB[] | undefined;
}

const NOOP_BEHAVIOUR: BlockBehaviour = {};

/**
 * Behaviour capabilities that carry state a later registration must not
 * silently discard.
 *
 * `getBoundingBoxes` is the dangerous one: bed and chest both had their
 * shared-shape bounds merged in by `registerShapedBlockBehaviours`, then
 * wiped by a later plain `register()` from their own module. The blocks
 * silently reverted to a full 1x1x1 cube for collision, selection and
 * raycasting. Nothing failed loudly, so it survived several passes.
 */
const PROTECTED_CAPABILITIES = ['getBoundingBoxes'] as const;

/**
 * Every callable/own key a behaviour contributes, including methods that live
 * on a class prototype rather than on the instance itself.
 */
function behaviourKeysOf(behaviour: BlockBehaviour): string[] {
  const keys = new Set<string>(Object.keys(behaviour));
  let prototype: object | null = Object.getPrototypeOf(behaviour) as object | null;
  while (prototype !== null && prototype !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(prototype)) {
      if (key !== 'constructor') keys.add(key);
    }
    prototype = Object.getPrototypeOf(prototype) as object | null;
  }
  return [...keys];
}

export class BlockBehaviourRegistry {
  private readonly behaviours = new Map<BlockId, BlockBehaviour>();

  /**
   * Registers a behaviour for a block.
   *
   * Registration is deliberately strict: replacing a behaviour that already
   * supplies a protected capability (currently `getBoundingBoxes`) with one
   * that does not is almost always an ordering accident, so it throws rather
   * than quietly dropping the capability. Callers that genuinely mean to
   * layer onto an existing behaviour should use {@link merge}, which is what
   * the shared shape declarations do.
   */
  public register(blockId: BlockId, behaviour: BlockBehaviour): void {
    const existing = this.behaviours.get(blockId);
    if (existing !== undefined) {
      for (const capability of PROTECTED_CAPABILITIES) {
        if (existing[capability] !== undefined && behaviour[capability] === undefined) {
          throw new Error(
            `Block ${String(blockId)}: register() would drop "${capability}" from the existing behaviour. `
            + `Use merge() to layer onto it, or carry the capability through explicitly.`,
          );
        }
      }
    }
    this.behaviours.set(blockId, behaviour);
  }

  /**
   * Layers `behaviour` onto whatever is already registered for `blockId`,
   * with the new fields taking precedence. Safe regardless of registration
   * order, which is why bounds-only declarations use it.
   */
  public merge(blockId: BlockId, behaviour: BlockBehaviour): void {
    const existing = this.behaviours.get(blockId);
    if (existing === undefined) {
      this.behaviours.set(blockId, behaviour);
      return;
    }
    // Behaviours are a mix of object literals and class instances. A plain
    // spread only copies own enumerable properties, which would silently drop
    // every prototype method of a class-based behaviour (BedBehaviour's
    // onInteract, for one). Layer via prototype chains instead so both forms
    // survive, with the incoming behaviour taking precedence.
    const merged = Object.create(
      Object.getPrototypeOf(existing) as object | null,
      Object.getOwnPropertyDescriptors(existing),
    ) as Record<string, unknown>;
    const incoming = behaviour as unknown as Record<string, unknown>;
    for (const key of behaviourKeysOf(behaviour)) {
      merged[key] = incoming[key];
    }
    this.behaviours.set(blockId, merged as unknown as BlockBehaviour);
  }

  public get(blockId: BlockId): BlockBehaviour {
    return this.behaviours.get(blockId) ?? NOOP_BEHAVIOUR;
  }

  public requiresNeighbourReconciliation(blockId: BlockId): boolean {
    const behaviour = this.get(blockId);
    return behaviour.requiresNeighbourReconciliation === true
      || behaviour.neighborChanged !== undefined
      || behaviour.canProvidePower === true;
  }
}

export function forEachBlockBounds(
  registry: BlockRegistry,
  behaviours: BlockBehaviourRegistry,
  world: BlockUpdateWorld,
  x: number, y: number, z: number,
  type: BoundingBoxType,
  fullCubeScratch: AABB | undefined,
  visitor: (bounds: AABB) => void,
): void {
  const blockId = world.getBlock(x, y, z);
  if (blockId === 0) return;
  const behaviour = behaviours.get(blockId);
  if (behaviour.getBoundingBoxes) {
    const ctx: BlockBehaviourContext = { world, gameTick: 0 };
    const bounds = behaviour.getBoundingBoxes(ctx, x, y, z, type);
    if (bounds !== undefined) {
      for (const bound of bounds) visitor(bound);
      return;
    }
  }
  const def = registry.getById(blockId);
  if (type === 'collision' && (!def || !def.solid)) return;
  if (fullCubeScratch !== undefined) {
    visitor(fullCubeScratch.setBounds(x, y, z, x + 1, y + 1, z + 1));
  } else {
    visitor(new AABB(x, y, z, x + 1, y + 1, z + 1));
  }
}

export function getBlockBounds(
  registry: BlockRegistry,
  behaviours: BlockBehaviourRegistry,
  world: BlockUpdateWorld,
  x: number, y: number, z: number,
  type: BoundingBoxType
): AABB[] {
  const bounds: AABB[] = [];
  forEachBlockBounds(registry, behaviours, world, x, y, z, type, undefined, (bound) => bounds.push(bound));
  return bounds;
}
