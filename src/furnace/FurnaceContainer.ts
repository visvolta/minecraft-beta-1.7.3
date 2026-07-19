import type { ItemStack } from '../inventory/ItemStack';
import { getMaxStackSize } from '../inventory/ItemStack';
import type { SmeltingRegistry } from './SmeltingRegistry';
import type { FuelRegistry } from './FuelRegistry';

/**
 * Authoritative persistent state container for a single placed furnace (`Keep furnace state authoritative`).
 * Keyed permanently by `(x, y, z)` across both unlit (`61`) and lit (`62`) block state transitions (`Preserve facing on block-state changes`).
 */
export class FurnaceContainer {
  public inputSlot: ItemStack | null = null;
  public fuelSlot: ItemStack | null = null;
  public outputSlot: ItemStack | null = null;
  public remainingBurnTime = 0;
  public totalBurnTime = 0;
  public smeltProgress = 0;

  public constructor(
    public readonly x: number,
    public readonly y: number,
    public readonly z: number,
    public facing = 3
  ) {}

  public isBurning(): boolean {
    return this.remainingBurnTime > 0;
  }

  public getSlotStack(slotIndex: number): ItemStack | null {
    if (slotIndex === 0) return this.inputSlot;
    if (slotIndex === 1) return this.fuelSlot;
    if (slotIndex === 2) return this.outputSlot;
    return null;
  }

  public setSlotStack(slotIndex: number, stack: ItemStack | null): void {
    if (slotIndex === 0) this.inputSlot = stack;
    else if (slotIndex === 1) this.fuelSlot = stack;
    else if (slotIndex === 2) this.outputSlot = stack;
  }

  /**
   * Ticks this furnace container once per 20Hz game tick (`Match Beta 1.7.3 furnace behaviour exactly`).
   * Returns true if the block's lit state (`isBurning()`) changed during this tick (`so block ID 61/62 can be updated while preserving metadata/facing`).
   */
  public tick(smeltingRegistry: SmeltingRegistry, fuelRegistry: FuelRegistry): boolean {
    const wasBurning = this.isBurning();
    let stateChanged = false;

    if (this.remainingBurnTime > 0) {
      this.remainingBurnTime--;
    }

    const recipe = smeltingRegistry.getRecipe(this.inputSlot);
    const canSmelt =
      recipe !== undefined &&
      (this.outputSlot === null ||
        (this.outputSlot.matches(recipe.output) &&
          this.outputSlot.count + recipe.output.count <= getMaxStackSize(this.outputSlot.identity)));

    if (!canSmelt) {
      this.smeltProgress = 0;
    } else {
      if (this.remainingBurnTime === 0) {
        const burnDuration = fuelRegistry.getBurnTime(this.fuelSlot);
        if (burnDuration > 0) {
          this.totalBurnTime = this.remainingBurnTime = burnDuration;
          stateChanged = true;

          if (this.fuelSlot !== null) {
            this.fuelSlot.count--;
            if (this.fuelSlot.count <= 0) {
              const containerReturn = fuelRegistry.getContainerReturn(this.fuelSlot);
              this.fuelSlot = containerReturn ?? null;
            }
          }
        }
      }

      if (this.isBurning()) {
        this.smeltProgress++;
        if (this.smeltProgress >= recipe.duration) {
          if (
            this.outputSlot === null ||
            (this.outputSlot.matches(recipe.output) &&
              this.outputSlot.count + recipe.output.count <= getMaxStackSize(this.outputSlot.identity))
          ) {
            this.smeltProgress = 0;
            if (this.outputSlot === null) {
              this.outputSlot = recipe.output.clone();
            } else {
              this.outputSlot.count += recipe.output.count;
            }

            if (this.inputSlot !== null) {
              this.inputSlot.count--;
              if (this.inputSlot.count <= 0) {
                this.inputSlot = null;
              }
            }
          } else {
            this.smeltProgress = 0;
          }
        }
      } else {
        // Not burning and no fuel -> pause progress (`out_of_fuel_reset: pause_progress`)
      }
    }

    if (wasBurning !== this.isBurning()) {
      stateChanged = true;
    }

    return stateChanged;
  }

  public clear(): void {
    this.inputSlot = null;
    this.fuelSlot = null;
    this.outputSlot = null;
    this.remainingBurnTime = 0;
    this.totalBurnTime = 0;
    this.smeltProgress = 0;
  }
}
