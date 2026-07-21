/**
 * Structured description of *why* an entity took damage (Beta `DamageSource`).
 *
 * Kept intentionally small and extensible: it carries the cause category, an
 * optional attacker (a positional reference used to derive knockback direction
 * and to notify the killer), and a few behaviour flags. There is no resistance,
 * armour or status-effect framework.
 *
 * `LivingEntity.attackEntityFrom(source, amount)` is the single entry point
 * that interprets a source; environmental damage (fall/lava/drown/…) and
 * player/mob attacks all flow through the same shared path.
 */
export type DamageCategory =
  | 'generic'
  | 'player'
  | 'mob'
  | 'explosion'
  | 'fall'
  | 'fire'
  | 'lava'
  | 'drown'
  | 'suffocate'
  | 'cactus'
  | 'environment'
  | 'void';

/**
 * The minimal information a damage source needs from whoever/whatever caused
 * it. Both `Player` and `LivingEntity` satisfy this structurally. Deliberately
 * not a runtime entity reference, so it is never serialized as a fragile id.
 */
export interface DamageAttacker {
  readonly position: { x: number; y: number; z: number };
}

export class DamageSource {
  private constructor(
    /** Stable string id, e.g. "player", "fall", "lava". */
    public readonly type: string,
    public readonly category: DamageCategory,
    /** Entity responsible (for knockback direction + onKill). Undefined for environmental damage. */
    public readonly attacker: DamageAttacker | undefined,
    /** Whether this source applies directional knockback. */
    public readonly appliesKnockback: boolean,
    /** Whether this source ignores the normal invulnerability window (e.g. void). */
    public readonly bypassesInvulnerability: boolean,
    /** Whether this is fire-related (for future cooked-drops etc.). */
    public readonly fire: boolean,
  ) {}

  /** Player melee attack. */
  public static player(attacker: DamageAttacker): DamageSource {
    return new DamageSource('player', 'player', attacker, true, false, false);
  }

  /** Attack from another mob. */
  public static mob(attacker: DamageAttacker): DamageSource {
    return new DamageSource('mob', 'mob', attacker, true, false, false);
  }

  /** Explosion damage attributed to its source entity. */
  public static explosion(attacker: DamageAttacker): DamageSource {
    return new DamageSource('explosion', 'explosion', attacker, false, false, false);
  }

  /** Unattributed generic damage. */
  public static generic(): DamageSource {
    return new DamageSource('generic', 'generic', undefined, false, false, false);
  }

  /** Fall damage (no knockback, no attacker). */
  public static fall(): DamageSource {
    return new DamageSource('fall', 'fall', undefined, false, false, false);
  }

  /** Fire damage. */
  public static fire(): DamageSource {
    return new DamageSource('fire', 'fire', undefined, false, false, true);
  }

  /** Lava damage. */
  public static lava(): DamageSource {
    return new DamageSource('lava', 'lava', undefined, false, false, true);
  }

  /** Drowning damage. */
  public static drown(): DamageSource {
    return new DamageSource('drown', 'drown', undefined, false, false, false);
  }

  /** Suffocation (inside a block) damage. */
  public static suffocate(): DamageSource {
    return new DamageSource('suffocate', 'suffocate', undefined, false, false, false);
  }

  public static cactus(): DamageSource { return new DamageSource('cactus','cactus',undefined,false,false,false); }
  public static environment(): DamageSource { return new DamageSource('environment','environment',undefined,false,false,false); }

  /** Out-of-world / void damage; bypasses invulnerability. */
  public static outOfWorld(): DamageSource {
    return new DamageSource('void', 'void', undefined, false, true, false);
  }
}
