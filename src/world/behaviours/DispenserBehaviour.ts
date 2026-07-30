import { BlockIds } from '../../blocks/BlockId';
import type { BlockBehaviour, BlockBehaviourContext, BlockBehaviourRegistry } from '../BlockBehaviour';
import type { NeighbourUpdateEvent } from '../updates/BlockMutation';

import type { DispenserManager } from '../../dispenser/DispenserManager';
import { ArrowEntity } from '../../entities/projectiles/ArrowEntity';
import { SnowballEntity, ThrownEggEntity } from '../../entities/projectiles/ThrownItemEntity';

/** Piston-style direction offsets for dispenser facing. */
const DIR_OFFSETS: readonly { readonly x: number; readonly y: number; readonly z: number }[] = [
  { x: 0, y: -1, z: 0 }, { x: 0, y: 1, z: 0 },
  { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 },
  { x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 },
];

const SLOTS = 9;

/**
 * Beta `BlockDispenser`: edge-triggered redstone dispense from a 9-slot
 * inventory. On each rising-edge power transition, picks a random occupied
 * slot and dispenses:
 *   - Arrow → ArrowEntity projectile
 *   - Snowball → SnowballEntity projectile
 *   - Egg → ThrownEggEntity projectile
 *   - Other → DroppedItemEntity (drop in front)
 *
 * Constant power does NOT repeatedly dispense. A new power pulse triggers one
 * new dispense. Metadata bits 0-2 = facing direction (same as piston).
 *
 * NOTE: The 9-slot inventory is in-memory per-behavior-instance (Map keyed by
 * position). Full GUI integration and NBT persistence require a
 * DispenserManager + DispenserUi + Engine wiring (like FurnaceManager), which
 * is the next implementation step.
 */
export class DispenserBehaviour implements BlockBehaviour {
  public readonly requiresNeighbourReconciliation = true;
  /** Per-position power tracking for edge-triggered dispense. */
  private readonly poweredSet = new Set<string>();

  /**
   * Opens the dispenser UI. Supplied by the engine; when absent (headless)
   * the click is still consumed so the block is not treated as a placement
   * surface.
   */
  private openUi: ((x: number, y: number, z: number) => void) | undefined;

  public constructor(private readonly manager: DispenserManager) {}

  public setUiOpener(open: (x: number, y: number, z: number) => void): void {
    this.openUi = open;
  }

  public onInteract(_ctx: BlockBehaviourContext, x: number, y: number, z: number): boolean {
    this.openUi?.(x, y, z);
    return true;
  }

  public neighborChanged(
    ctx: BlockBehaviourContext, x: number, y: number, z: number,
    _sx: number, _sy: number, _sz: number, _event?: NeighbourUpdateEvent,
  ): void {
    const key = `${x},${y},${z}`;
    const powered = (ctx.power?.isBlockIndirectlyPowered({ x, y, z }) ?? false);
    const wasPowered = this.poweredSet.has(key);

    if (powered && !wasPowered) {
      this.poweredSet.add(key);
      this.dispense(ctx, x, y, z);
    } else if (!powered && wasPowered) {
      this.poweredSet.delete(key);
    }
  }

  /** Beta `dispense`: pick random occupied slot, process item. */
  private dispense(ctx: BlockBehaviourContext, x: number, y: number, z: number): void {
    // The manager owns the inventory so it persists with the world and is
    // namespaced per dimension.
    const inventory = this.manager.getOrCreate(x, y, z);
    const inv = inventory.getSlots();

    // Beta: pick a random occupied slot.
    const occupied = [];
    for (let i = 0; i < SLOTS; i++) {
      if (inv[i] !== null && inv[i] !== undefined) occupied.push(i);
    }
    if (occupied.length === 0) return; // Empty dispenser.

    const slot = occupied[Math.floor((ctx.nextInt?.(occupied.length) ?? Math.floor(Math.random() * occupied.length))) % occupied.length]!;
    const stack = inv[slot]!;

    // Get facing direction from metadata.
    const meta = ctx.world.getBlockMetadata(x, y, z);
    const dir = meta & 7;
    const off = DIR_OFFSETS[dir] ?? { x: 0, y: 1, z: 0 };
    const spawnX = x + off.x + 0.5;
    const spawnY = y + off.y + 0.5;
    const spawnZ = z + off.z + 0.5;

    if (ctx.entities !== undefined) {
      const itemId = stack.identity.type === 'item' ? String(stack.identity.id) : '';
      // Arrow → ArrowEntity projectile.
      if (itemId === 'arrow') {
        this.spawnProjectile(ctx, 'arrow', spawnX, spawnY, spawnZ, off.x, off.y, off.z);
      } else if (itemId === 'snowball') {
        this.spawnProjectile(ctx, 'snowball', spawnX, spawnY, spawnZ, off.x, off.y, off.z);
      } else if (itemId === 'egg') {
        this.spawnProjectile(ctx, 'egg', spawnX, spawnY, spawnZ, off.x, off.y, off.z);
      } else {
        // Generic item: drop in front.
        ctx.world.dropBlockAsItem(Math.floor(spawnX), Math.floor(spawnY), Math.floor(spawnZ), BlockIds.Air);
      }
    }

    // Consume one item from the slot, through the inventory so the change is
    // recorded on the owning container rather than a detached array.
    stack.count -= 1;
    if (stack.count <= 0) inventory.setStack(slot, null);
    else inventory.setStack(slot, stack);
  }

  /** Spawns an Arrow/Snowball/Egg projectile in the given direction. */
  private spawnProjectile(ctx: BlockBehaviourContext, type: string, x: number, y: number, z: number, dx: number, dy: number, dz: number): void {
    if (ctx.entities === undefined) return;
    const manager = ctx.entities;
    const entityCtx = manager.context;
    if (type === 'arrow') {
      const arrow = new ArrowEntity(entityCtx, null, x, y, z);
      arrow.launch(dx, dy, dz, 1.5, 1);
      manager.add(arrow);
    } else {
      const projectile = type === 'snowball' ? new SnowballEntity(entityCtx, null, x, y, z) : new ThrownEggEntity(entityCtx, null, x, y, z);
      projectile.launch(dx, dy, dz, 1.5, 1);
      manager.add(projectile);
    }
  }
}

export function registerDispenserBehaviour(
  registry: BlockBehaviourRegistry,
  manager: DispenserManager,
): DispenserBehaviour {
  const behaviour = new DispenserBehaviour(manager);
  registry.register(BlockIds.Dispenser, behaviour);
  return behaviour;
}
