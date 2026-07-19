import type { ItemStack } from '../inventory/ItemStack';
import { getContainerReturn } from '../crafting/CraftingRecipe';

export interface FuelDefinition {
  readonly id: string | number;
  readonly metadata?: number | undefined; // -1 or undefined = wildcard
  readonly burnTime: number; // in ticks (20 ticks/sec)
}

/**
 * Authoritative fuel registry (`support the valid Beta fuels represented by currently registered items and blocks`).
 */
export class FuelRegistry {
  private readonly fuels: FuelDefinition[] = [];

  public register(fuel: FuelDefinition): void {
    this.fuels.push(fuel);
  }

  public getBurnTime(stack: ItemStack | null): number {
    if (stack === null || stack.count <= 0) return 0;
    for (const fuel of this.fuels) {
      if (String(stack.identity.id) === String(fuel.id)) {
        if (fuel.metadata === undefined || fuel.metadata === -1 || stack.metadata === fuel.metadata) {
          return fuel.burnTime;
        }
      }
    }
    return 0;
  }

  public isFuel(stack: ItemStack | null): boolean {
    return this.getBurnTime(stack) > 0;
  }

  public getContainerReturn(stack: ItemStack): ItemStack | undefined {
    return getContainerReturn(stack);
  }

  public getFuels(): ReadonlyArray<FuelDefinition> {
    return this.fuels;
  }

  public clear(): void {
    this.fuels.length = 0;
  }
}
