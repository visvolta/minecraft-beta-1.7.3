/**
 * Centralized entity factory.
 *
 * One authoritative factory used by:
 * - Spawn egg use behavior (instantiates mob from descriptor)
 * - /summon command (instantiates mob from name/registry lookup)
 * - Future custom/mod entities (register descriptor + constructor)
 *
 * No duplicate maps: uses SpawnEggDescriptor registry (primary/secondary colors,
 * display names) and maps entity string IDs directly to constructors via the
 * descriptor. The existing natural-spawn `createEntity` switch can eventually
 * be migrated to call this factory.
 */

import type { EntityWorldContext } from './core/EntityContext';
import type { Entity } from './core/Entity';
import { ZombieEntity } from './hostile/ZombieEntity';
import { SkeletonEntity } from './hostile/SkeletonEntity';
import { CreeperEntity } from './hostile/CreeperEntity';
import { SpiderEntity } from './hostile/SpiderEntity';
import { SlimeEntity } from './hostile/SlimeEntity';
import { PigEntity } from './living/PigEntity';
import { CowEntity } from './living/CowEntity';
import { SheepEntity } from './living/SheepEntity';
import { ChickenEntity } from './living/ChickenEntity';
import { SquidEntity } from './living/SquidEntity';
import { WolfEntity } from './living/WolfEntity';
import { ZombiePigmanEntity } from './hostile/PigZombieEntity';
import { GhastEntity } from './hostile/GhastEntity';
import type { SpawnEggDescriptor } from './SpawnEggDescriptor';

export interface EntityFactoryOptions {
  readonly descriptors: Readonly<Record<string, SpawnEggDescriptor>>;
}

export class EntityFactory {
  private readonly descriptors: Readonly<Record<string, SpawnEggDescriptor>>;

  public constructor(options: EntityFactoryOptions) {
    this.descriptors = options.descriptors;
  }

  public listSpawnableNames(): readonly string[] {
    return Object.keys(this.descriptors).sort();
  }

  public has(name: string): boolean {
    return this.descriptors[name] !== undefined;
  }

  public resolveName(input: string): string | undefined {
    const normalized = input.trim();
    // Direct match
    if (this.descriptors[normalized]) return normalized;
    // Case-insensitive match against descriptor keys
    const lower = normalized.toLowerCase();
    for (const key of Object.keys(this.descriptors)) {
      if (key.toLowerCase() === lower) return key;
    }
    return undefined;
  }

  public createByDescriptorId(
    descriptorId: string,
    ctx: EntityWorldContext,
    x: number,
    y: number,
    z: number,
  ): Entity | undefined {
    const desc = this.descriptors[descriptorId];
    if (!desc) return undefined;
    return this.createFromDescriptor(desc, ctx, x, y, z);
  }

  public createFromDescriptor(
    desc: SpawnEggDescriptor,
    ctx: EntityWorldContext,
    x: number,
    y: number,
    z: number,
  ): Entity | undefined {
    // Direct constructor mapping by descriptor string id
    switch (desc.entityStringId) {
      case 'Zombie': return new ZombieEntity(ctx, x, y, z);
      case 'Skeleton': return new SkeletonEntity(ctx, x, y, z);
      case 'Creeper': return new CreeperEntity(ctx, x, y, z);
      case 'Spider': return new SpiderEntity(ctx, x, y, z);
      case 'Slime': return new SlimeEntity(ctx, x, y, z);
      case 'Pig': return new PigEntity(ctx, x, y, z);
      case 'Cow': return new CowEntity(ctx, x, y, z);
      case 'Sheep': return new SheepEntity(ctx, x, y, z);
      case 'Chicken': return new ChickenEntity(ctx, x, y, z);
      case 'Squid': return new SquidEntity(ctx, x, y, z);
      case 'Wolf': return new WolfEntity(ctx, x, y, z);
      case 'PigZombie': return new ZombiePigmanEntity(ctx, x, y, z);
      case 'Ghast': return new GhastEntity(ctx, x, y, z);
      default: return undefined;
    }
  }
}
