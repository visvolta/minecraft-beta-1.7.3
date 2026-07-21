import type { HotbarHudRenderer } from '../inventory/HotbarHudRenderer';
import type { PlayerEquipment } from '../inventory/PlayerEquipment';
import { ArmourHudRenderer } from './ArmourHudRenderer';
import { HealthHudRenderer } from './HealthHudRenderer';
import { HungerHudRenderer } from './HungerHudRenderer';
import type { Player } from './Player';

export class HudRenderer {
  public readonly health: HealthHudRenderer;
  public readonly armour: ArmourHudRenderer;
  public readonly hunger: HungerHudRenderer;

  public constructor(
    public readonly hotbar: HotbarHudRenderer,
    player: Player,
    equipment: PlayerEquipment,
  ) {
    this.health = new HealthHudRenderer(player);
    this.armour = new ArmourHudRenderer(equipment);
    this.hunger = new HungerHudRenderer(player);
  }

  public update(selected: number): void {
    this.hotbar.update(selected);
    const layout = this.hotbar.getLayout();
    this.health.update(layout);
    this.armour.update(layout);
    this.hunger.update(layout);
  }

  public render(): void {
    this.hotbar.render();
  }

  public dispose(): void {
    this.health.dispose();
    this.armour.dispose();
    this.hunger.dispose();
    this.hotbar.dispose();
  }
}
