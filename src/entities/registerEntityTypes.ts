import type { EntityTypeRegistry } from './core/EntityType';
import { EntityTypeIds } from './core/EntityType';
import { DroppedItemEntity } from './items/DroppedItemEntity';
import { FallingBlockEntity } from './FallingBlockEntity';
import { PigEntity } from './living/PigEntity';

/**
 * Registers every entity type's string id, numeric id and deserialiser with
 * the registry (Beta `EntityList.addMapping`). Called once during Engine
 * construction before the EntityManager is created.
 *
 * String ids match Beta's entity keys ("Item", "FallingSand", "Pig") so saved
 * worlds stay readable and self-describing. Additional types are registered
 * here as they are introduced.
 */
export function registerEntityTypes(registry: EntityTypeRegistry): void {
  registry.register(EntityTypeIds.DroppedItem, 'Item', DroppedItemEntity.deserialize);
  registry.register(EntityTypeIds.FallingBlock, 'FallingSand', FallingBlockEntity.deserialize);
  registry.register(EntityTypeIds.Pig, 'Pig', PigEntity.deserialize);
}
