import type { EntityTypeRegistry } from './core/EntityType';
import { EntityTypeIds } from './core/EntityType';
import { DroppedItemEntity } from './items/DroppedItemEntity';
import { FallingBlockEntity } from './FallingBlockEntity';
import { PigEntity } from './living/PigEntity';
import { CowEntity } from './living/CowEntity';
import { SheepEntity } from './living/SheepEntity';
import { ChickenEntity } from './living/ChickenEntity';
import { ZombieEntity } from './hostile/ZombieEntity';
import { SkeletonEntity } from './hostile/SkeletonEntity';
import { SpiderEntity } from './hostile/SpiderEntity';
import { CreeperEntity } from './hostile/CreeperEntity';
import { ArrowEntity } from './projectiles/ArrowEntity';
import { PrimedTntEntity } from './PrimedTntEntity';
import { MinecartEntity } from './MinecartEntity';

/**
 * Registers every entity type's string id, numeric id and deserialiser with
 * the registry (Beta `EntityList.addMapping`). Called once during Engine
 * construction before the EntityManager is created.
 *
 * String ids match Beta's entity keys ("Item", "FallingSand", "Pig", "Cow",
 * "Sheep", "Chicken") so saved worlds stay readable and self-describing.
 */
export function registerEntityTypes(registry: EntityTypeRegistry): void {
  registry.register(EntityTypeIds.DroppedItem, 'Item', DroppedItemEntity.deserialize);
  registry.register(EntityTypeIds.FallingBlock, 'FallingSand', FallingBlockEntity.deserialize);
  registry.register(EntityTypeIds.Pig, 'Pig', PigEntity.deserialize);
  registry.register(EntityTypeIds.Cow, 'Cow', CowEntity.deserialize);
  registry.register(EntityTypeIds.Sheep, 'Sheep', SheepEntity.deserialize);
  registry.register(EntityTypeIds.Chicken, 'Chicken', ChickenEntity.deserialize);
  registry.register(EntityTypeIds.Zombie, 'Zombie', ZombieEntity.deserialize);
  registry.register(EntityTypeIds.Skeleton, 'Skeleton', SkeletonEntity.deserialize);
  registry.register(EntityTypeIds.Spider, 'Spider', SpiderEntity.deserialize);
  registry.register(EntityTypeIds.Creeper, 'Creeper', CreeperEntity.deserialize);
  registry.register(EntityTypeIds.Arrow, 'Arrow', ArrowEntity.deserialize);
  registry.register(EntityTypeIds.PrimedTnt, 'PrimedTnt', PrimedTntEntity.deserialize);
  registry.register(EntityTypeIds.Minecart, 'Minecart', MinecartEntity.deserialize);
}
