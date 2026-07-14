/**
 * Faithful port of java.util.Random's 48-bit linear congruential generator.
 *
 * Beta 1.7.3's terrain noise depends on the *exact* sequence java.util.Random
 * produces (e.g. NoiseGeneratorPerlin's permutation-table shuffle uses
 * random.nextInt(256 - j) + j during construction) — a different RNG, or
 * even a subtly different nextInt()/nextDouble() implementation, would
 * silently produce different terrain from the same seed. This class
 * reproduces Java's algorithm bit-for-bit, including its specific
 * power-of-two fast path and rejection-sampling loop in nextInt(bound).
 *
 * Verified against real JVM output (see world/generation/random tests).
 */

const MULTIPLIER = 0x5deece66dn;
const INCREMENT = 0xbn;
const MASK = (1n << 48n) - 1n;

/** Wraps a bigint into signed 32-bit range, matching Java int overflow. */
function toInt32(value: bigint): number {
  const masked = Number(BigInt.asIntN(32, value));
  return masked;
}

export class JavaRandom {
  private seed: bigint;

  public constructor(seed: number | bigint) {
    this.seed = 0n;
    this.setSeed(seed);
  }

  /** Reinitializes the generator with a new seed, matching Random.setSeed(). */
  public setSeed(seed: number | bigint): void {
    const seedBig = typeof seed === 'bigint' ? seed : BigInt(Math.trunc(seed));
    this.seed = (seedBig ^ MULTIPLIER) & MASK;
  }

  /**
   * Core LCG step. Returns the top `bits` bits of the 48-bit state,
   * reinterpreted as a signed 32-bit value when bits === 32 (matching
   * Java's `(int)(seed >>> (48 - bits))`).
   */
  private next(bits: number): number {
    this.seed = (this.seed * MULTIPLIER + INCREMENT) & MASK;
    const shifted = this.seed >> BigInt(48 - bits);
    return bits === 32 ? toInt32(shifted) : Number(shifted);
  }

  /** Equivalent to Random.nextInt(): a full-range signed 32-bit integer. */
  public nextInt(): number;
  /** Equivalent to Random.nextInt(bound): uniform in [0, bound). */
  public nextInt(bound: number): number;
  public nextInt(bound?: number): number {
    if (bound === undefined) {
      return this.next(32);
    }

    if (bound <= 0) {
      throw new RangeError('bound must be positive');
    }

    // Power-of-two fast path, matching Java's (bound & -bound) == bound check.
    if ((bound & -bound) === bound) {
      return Number((BigInt(bound) * BigInt(this.next(31))) >> 31n);
    }

    let bits: number;
    let value: number;

    do {
      bits = this.next(31);
      value = bits % bound;
      // Java rejects values that would make the distribution non-uniform;
      // the overflow-prone check is done in 32-bit signed arithmetic.
    } while (toInt32(BigInt(bits - value + (bound - 1))) < 0);

    return value;
  }

  /** Equivalent to Random.nextLong(). Returned as a bigint (may exceed 2^53). */
  public nextLong(): bigint {
    const hi = BigInt(this.next(32));
    const lo = BigInt(this.next(32));
    return (hi << 32n) + lo;
  }

  /** Equivalent to Random.nextDouble(): uniform in [0, 1). */
  public nextDouble(): number {
    const hi = this.next(26);
    const lo = this.next(27);
    return (hi * 134217728 + lo) / 9007199254740992; // hi*2^27 + lo, / 2^53
  }

  /** Equivalent to Random.nextFloat(): uniform in [0, 1), single precision. */
  public nextFloat(): number {
    return this.next(24) / 16777216; // / 2^24
  }

  /** Equivalent to Random.nextBoolean(). */
  public nextBoolean(): boolean {
    return this.next(1) !== 0;
  }
}
