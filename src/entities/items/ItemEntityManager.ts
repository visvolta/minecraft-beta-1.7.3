import type { BlockRegistry } from '../../blocks/BlockRegistry';
import type { Player } from '../../player/Player';
import type { Drop } from './BlockDropResolver';
import type { Inventory } from '../../inventory/Inventory';
import type { EntityManager } from '../core/EntityManager';
import { DroppedItemEntity } from './DroppedItemEntity';

/**
 * Thin facade for dropped items on top of the shared {@link EntityManager}.
 *
 * Movement, gravity, collision, interpolation, chunk streaming, persistence
 * and disposal are all handled by the EntityManager and {@link DroppedItemEntity}.
 * This facade only provides ergonomic spawn helpers and the player-pickup
 * pass (which needs the player + inventory and so stays outside the entity).
 */
export class ItemEntityManager {
  public constructor(
    private readonly entityManager: EntityManager,
    private readonly inventory: Inventory,
    private readonly blockRegistry: BlockRegistry,
  ) {}

  /** Spawns a dropped-item entity at the given coordinates. */
  public spawnItem(x: number, y: number, z: number, drop: Drop, delay = 10): DroppedItemEntity {
    const item = new DroppedItemEntity(this.entityManager.context, drop, x, y, z, delay);
    this.entityManager.add(item);
    return item;
  }

  /** Spawns a thrown dropped-item entity with specific initial velocities. */
  public spawnThrownItem(
    x: number, y: number, z: number,
    drop: Drop,
    motionX: number, motionY: number, motionZ: number,
    delay = 40,
  ): DroppedItemEntity {
    const item = new DroppedItemEntity(this.entityManager.context, drop, x, y, z, delay);
    item.velocity.x = motionX;
    item.velocity.y = motionY;
    item.velocity.z = motionZ;
    this.entityManager.add(item);
    return item;
  }

  /**
   * Player-pickup pass. Runs after the EntityManager tick each simulation
   * step. Uses a chunk-first AABB query (never scans all entities), matching
   * Beta's expanded player pickup box (×1.0 horizontal, ×0.5 vertical).
   */
  public tickPickups(player: Player): void {
    const pickupBox = player.getAABB().expand(1.0, 0.5, 1.0);

    const candidates = this.entityManager.getEntitiesInAABB(
      pickupBox,
      (entity): entity is DroppedItemEntity =>
        entity instanceof DroppedItemEntity && entity.delayBeforeCanPickup === 0 && !entity.removed,
    );

    for (const item of candidates) {
      if (item.removed || !item.getAABB().intersects(pickupBox)) {
        continue;
      }

      const accepted = this.inventory.insert(
        item.drop.type,
        item.drop.id,
        item.drop.count,
        item.drop.metadata,
      );

      if (accepted <= 0) {
        continue;
      }

      const remainder = item.drop.count - accepted;
      this.triggerPickup(item.drop.type, item.drop.id, accepted, item.drop.metadata);

      if (remainder <= 0) {
        this.entityManager.remove(item);
      } else {
        item.drop = { ...item.drop, count: remainder };
        item.rebuildVisualsForCount(remainder);
      }
    }
  }

  private triggerPickup(type: 'block' | 'item', id: number | string, count: number, metadata: number): void {
    let displayName = 'Unknown';
    if (type === 'block') {
      const def = this.blockRegistry.getById(id as number);
      displayName = def?.displayName ?? 'Block';
    } else {
      displayName = (id as string)
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    }
    console.log(
      `[PICKUP DEBUG] Collected: ${displayName} (ID: ${id}) | Quantity: ${count} | Metadata: ${metadata}`,
    );
  }
}
