import type { ItemEntityManager } from '../entities/items/ItemEntityManager';
import { ARMOUR_SLOTS } from '../items/ArmourMaterial';
import type { Inventory } from '../inventory/Inventory';
import type { ItemStack } from '../inventory/ItemStack';
import type { JavaRandom } from '../world/generation/random/JavaRandom';
import type { DeathScreen } from './DeathScreen';
import type { Player } from './Player';

export class PlayerDeathController {
  private processed = false;
  public readonly deathLocation = { x: 0, y: 0, z: 0 };

  public constructor(
    private readonly player: Player,
    private readonly inventory: Inventory,
    private readonly items: ItemEntityManager,
    private readonly rng: JavaRandom,
    private readonly screen: DeathScreen,
    private readonly onProcessed?: () => void,
  ) {}

  public update(): void {
    if (this.player.isAlive()) {
      this.processed = false;
      return;
    }
    if (this.processed) return;
    this.processed = true;
    this.deathLocation.x = this.player.position.x;
    this.deathLocation.y = this.player.position.y;
    this.deathLocation.z = this.player.position.z;

    for (let i = 0; i < this.inventory.getSlots().length; i++) {
      const stack = this.inventory.getStack(i);
      if (stack === null) continue;
      this.inventory.setStack(i, null);
      this.dropStack(stack);
    }

    const equipment = this.inventory.getEquipment();
    if (equipment !== undefined) {
      for (const slot of ARMOUR_SLOTS) {
        const stack = equipment.takeStack(slot);
        if (stack !== null) this.dropStack(stack);
      }
    }

    this.player.wishVelocity.x = 0;
    this.player.wishVelocity.z = 0;
    this.screen.open();
    this.onProcessed?.();
  }

  public reset(): void {
    this.processed = false;
  }

  private dropStack(stack: ItemStack): void {
    const angle = this.rng.nextFloat() * Math.PI * 2;
    const speed = 0.1 + this.rng.nextFloat() * 0.2;
    this.items.spawnThrownItem(
      this.player.position.x,
      this.player.position.y + 0.5,
      this.player.position.z,
      {
        type: stack.identity.type,
        id: stack.identity.id,
        count: stack.count,
        metadata: stack.metadata,
        damage: stack.damage,
      },
      Math.cos(angle) * speed,
      0.2 + this.rng.nextFloat() * 0.15,
      Math.sin(angle) * speed,
      40,
    );
  }
}
