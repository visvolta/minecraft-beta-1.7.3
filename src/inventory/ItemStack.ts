export interface ItemIdentity {
  readonly id: number | string; // BlockId (number) or item texture name (string)
  readonly type: 'block' | 'item';
}

export class ItemStack {
  public readonly identity: ItemIdentity;
  public count: number;
  public metadata: number;

  public constructor(id: number | string, type: 'block' | 'item', count: number, metadata = 0) {
    this.identity = { id, type };
    this.count = count;
    this.metadata = metadata;
  }

  public clone(): ItemStack {
    return new ItemStack(this.identity.id, this.identity.type, this.count, this.metadata);
  }

  public matches(other: ItemStack): boolean {
    return (
      this.identity.id === other.identity.id &&
      this.identity.type === other.identity.type &&
      this.metadata === other.metadata
    );
  }
}

/**
 * Returns the Beta 1.7.3-backed maximum stack size for the given item identity.
 */
export function getMaxStackSize(identity: ItemIdentity): number {
  if (identity.type === 'block') {
    return 64; // All blocks stack to 64 in Beta 1.7.3
  }

  const name = identity.id as string;
  if (name.includes('sign') || name === 'reeds') {
    return 16; // Signs and Sugar Canes stack to 16 in Beta 1.7.3
  }

  // Weapons, tools, and armor do not stack (max size 1)
  if (
    name.includes('sword') ||
    name.includes('pickaxe') ||
    name.includes('axe') ||
    name.includes('shovel') ||
    name.includes('hoe') ||
    name.includes('helmet') ||
    name.includes('chestplate') ||
    name.includes('leggings') ||
    name.includes('boots') ||
    name === 'shears' ||
    name === 'flint_and_steel' ||
    name === 'bucket_empty' ||
    name === 'bucket_water' ||
    name === 'bucket_lava' ||
    name === 'bucket_milk'
  ) {
    return 1;
  }

  return 64; // Default stack limit for resources/items
}
