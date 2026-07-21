/** Structured description of why an entity took damage. */
export type DamageCategory =
  | 'generic'
  | 'player'
  | 'mob'
  | 'projectile'
  | 'explosion'
  | 'fall'
  | 'fire'
  | 'lava'
  | 'drown'
  | 'suffocate'
  | 'cactus'
  | 'environment'
  | 'starve'
  | 'void';

export interface DamageAttacker {
  readonly position: { x: number; y: number; z: number };
}

export class DamageSource {
  private constructor(
    public readonly type: string,
    public readonly category: DamageCategory,
    public readonly attacker: DamageAttacker | undefined,
    public readonly appliesKnockback: boolean,
    public readonly bypassesInvulnerability: boolean,
    public readonly fire: boolean,
    /** Explicit typed equivalent of later DamageSource.setDamageBypassesArmor(). */
    public readonly bypassesArmour: boolean,
  ) {}

  public static player(attacker: DamageAttacker): DamageSource {
    return new DamageSource('player', 'player', attacker, true, false, false, false);
  }

  public static mob(attacker: DamageAttacker): DamageSource {
    return new DamageSource('mob', 'mob', attacker, true, false, false, false);
  }

  public static projectile(attacker?: DamageAttacker): DamageSource {
    return new DamageSource('projectile', 'projectile', attacker, true, false, false, false);
  }

  public static explosion(attacker: DamageAttacker): DamageSource {
    return new DamageSource('explosion', 'explosion', attacker, false, false, false, false);
  }

  /** Generic/absolute damage follows the typed unblockable DamageSource behaviour. */
  public static generic(): DamageSource {
    return new DamageSource('generic', 'generic', undefined, false, false, false, true);
  }

  public static fall(): DamageSource {
    return new DamageSource('fall', 'fall', undefined, false, false, false, false);
  }

  public static fire(): DamageSource {
    return new DamageSource('fire', 'fire', undefined, false, false, true, false);
  }

  public static lava(): DamageSource {
    return new DamageSource('lava', 'lava', undefined, false, false, true, false);
  }

  public static drown(): DamageSource {
    return new DamageSource('drown', 'drown', undefined, false, false, false, false);
  }

  public static suffocate(): DamageSource {
    return new DamageSource('suffocate', 'suffocate', undefined, false, false, false, false);
  }

  public static cactus(): DamageSource {
    return new DamageSource('cactus', 'cactus', undefined, false, false, false, false);
  }

  /** Project helper for absolute environmental damage (used by death/regression tests). */
  public static environment(): DamageSource {
    return new DamageSource('environment', 'environment', undefined, false, false, false, true);
  }

  /** Later-version hunger mechanic; starvation is unblockable. */
  public static starve(): DamageSource {
    return new DamageSource('starve', 'starve', undefined, false, true, false, true);
  }

  public static outOfWorld(): DamageSource {
    return new DamageSource('void', 'void', undefined, false, true, false, true);
  }
}
