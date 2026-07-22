import { ARMOUR_SLOTS, type ArmourSlot } from '../items/ArmourMaterial';
import { DEFAULT_ITEM_DEFINITIONS, type ItemDefinitionRegistry } from '../items/ItemDefinitionRegistry';
import { calculateDurabilityWeightedArmourValue, getArmourDurabilityDamage } from '../player/ArmourProtection';
import type { ItemStack, ItemDamageResult } from './ItemStack';

export interface BrokenArmourPiece {
  readonly slot: ArmourSlot;
  readonly stack: ItemStack;
  readonly result: ItemDamageResult;
}

/** Dedicated four-slot equipment storage; never participates in ordinary inventory scans. */
export class PlayerEquipment {
  private readonly stacks: Record<ArmourSlot, ItemStack | null> = {
    helmet: null,
    chestplate: null,
    leggings: null,
    boots: null,
  };
  private onBreak: ((piece: BrokenArmourPiece) => void) | undefined;
  private equipmentRevision = 0;

  public constructor(private readonly definitions: ItemDefinitionRegistry = DEFAULT_ITEM_DEFINITIONS) {}

  public get revision(): number {
    return this.equipmentRevision;
  }

  public setBreakHandler(handler: ((piece: BrokenArmourPiece) => void) | undefined): void {
    this.onBreak = handler;
  }

  public getStack(slot: ArmourSlot): ItemStack | null {
    return this.stacks[slot];
  }

  public getStacks(): readonly (ItemStack | null)[] {
    return ARMOUR_SLOTS.map((slot) => this.stacks[slot]);
  }

  public getEntries(): ReadonlyArray<readonly [ArmourSlot, ItemStack | null]> {
    return ARMOUR_SLOTS.map((slot) => [slot, this.stacks[slot]] as const);
  }

  public getArmourSlot(stack: ItemStack | null): ArmourSlot | undefined {
    if (stack === null || stack.identity.type !== 'item') return undefined;
    return this.definitions.get(stack.identity.id)?.armourSlot;
  }

  public accepts(slot: ArmourSlot, stack: ItemStack | null): boolean {
    return stack === null || (stack.count === 1 && this.getArmourSlot(stack) === slot);
  }

  public setStack(slot: ArmourSlot, stack: ItemStack | null): boolean {
    if (!this.accepts(slot, stack)) return false;
    if (this.stacks[slot] !== stack) {
      this.stacks[slot] = stack;
      this.equipmentRevision++;
    }
    return true;
  }

  public takeStack(slot: ArmourSlot): ItemStack | null {
    const stack = this.stacks[slot];
    if (stack !== null) {
      this.stacks[slot] = null;
      this.equipmentRevision++;
    }
    return stack;
  }

  public getArmourValue(): number {
    return calculateDurabilityWeightedArmourValue(this.getStacks());
  }

  /** Applies approved Beta-style wear to every piece after an accepted, non-bypassing hit. */
  public damageArmour(acceptedDamage: number): readonly BrokenArmourPiece[] {
    if (acceptedDamage <= 0) return [];
    const durabilityDamage = getArmourDurabilityDamage(acceptedDamage);
    const broken: BrokenArmourPiece[] = [];

    for (const slot of ARMOUR_SLOTS) {
      const stack = this.stacks[slot];
      if (stack === null) continue;
      const result = stack.damageItem(durabilityDamage, this.definitions);
      if (result.status !== 'broken') continue;
      this.stacks[slot] = null;
      this.equipmentRevision++;
      const piece = { slot, stack, result };
      broken.push(piece);
      this.onBreak?.(piece);
    }

    return broken;
  }

  public clear(): void {
    let changed = false;
    for (const slot of ARMOUR_SLOTS) {
      if (this.stacks[slot] !== null) changed = true;
      this.stacks[slot] = null;
    }
    if (changed) this.equipmentRevision++;
  }
}
