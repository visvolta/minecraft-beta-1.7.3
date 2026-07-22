import type { ArmourMaterialId, ArmourSlot } from './ArmourMaterial';
import type { ToolMaterialId } from './ToolMaterial';

export type ItemUseAction = 'none' | 'eat' | 'drink';
export type ToolClass = 'hand' | 'pickaxe' | 'axe' | 'shovel' | 'sword' | 'hoe';

export interface ItemDefinition {
  readonly id: string;
  readonly numericId?: number;
  readonly stackSize: number;
  readonly durability?: number;
  readonly foodValue?: number;
  readonly saturationValue?: number;
  readonly useAction: ItemUseAction;
  readonly containerItem?: string;
  readonly toolClass?: ToolClass;
  readonly toolMaterial?: ToolMaterialId;
  readonly miningSpeed?: number;
  readonly harvestLevel?: number;
  readonly combatBonus?: number;
  readonly armourSlot?: ArmourSlot;
  readonly armourMaterial?: ArmourMaterialId;
  readonly protection?: number;
  readonly placeBlockId?: number;
}
