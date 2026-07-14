/**
 * Faithful port of Beta 1.7.3's MathHelper sine lookup table
 * (`MathHelper.a(float)` / `MathHelper.b(float)` in mc-dev).
 *
 * Real Beta does not call `Math.sin`/`Math.cos` for cave tunnel steering —
 * it indexes a precomputed 65536-entry single-precision sine table using
 * a fixed-point-style index derived from the input angle. Cave tunnel
 * shape is a long chain of small angular steps compounded over many
 * iterations (see CaveCarver's tunnel walk), so using `Math.sin`/`Math.cos`
 * instead — even though more numerically precise in isolation — would
 * cause the accumulated tunnel path to visibly diverge from authentic
 * Beta output for the same seed. This table is therefore ported exactly,
 * not approximated, per this stage's explicit decision to prioritize
 * bit-faithful tunnel geometry over using native trig.
 *
 * Source (mc-dev MathHelper.java):
 *   private static float a[];
 *   public static final float a(float f) {
 *       return a[(int) (f * 10430.38F) & 0xffff];
 *   }
 *   public static final float b(float f) {
 *       return a[(int) (f * 10430.38F + 16384F) & 0xffff];
 *   }
 *   static {
 *       a = new float[0x10000];
 *       for (int i = 0; i < 0x10000; i++) {
 *           a[i] = (float) Math.sin((double) i * 3.1415926535897931D * 2D / 65536D);
 *       }
 *   }
 *
 * `a(f)` is sine; `b(f)` is cosine, implemented as sine phase-shifted by
 * a quarter table period (16384 / 65536 = 1/4 turn), matching the source
 * exactly rather than computing cosine independently.
 */

const TABLE_SIZE = 0x10000;

function buildSineTable(): Float32Array {
  const table = new Float32Array(TABLE_SIZE);

  for (let i = 0; i < TABLE_SIZE; i++) {
    // Matches the source's double-precision computation, then narrowed to
    // float32 by storage (Float32Array truncates on write, matching Java's
    // `(float) Math.sin(...)` cast).
    table[i] = Math.sin((i * Math.PI * 2) / TABLE_SIZE);
  }

  return table;
}

const SINE_TABLE = buildSineTable();

/**
 * Java `float` values are 32-bit; the source computes
 * `(int) (f * 10430.38F [+ 16384F])` entirely in float precision before
 * truncating to int. Each intermediate step is rounded to float32
 * (`Math.fround`) to match Java's per-operation float rounding, then the
 * final truncation to int uses `Math.trunc` (matches Java's (int) cast,
 * which truncates toward zero), and `& 0xffff` matches Java's mask
 * exactly since both languages perform this as a 32-bit signed bitwise
 * AND.
 */
function tableIndex(f: number, offsetFloat: number): number {
  const scaled = Math.fround(f * Math.fround(10430.38));
  const shifted = offsetFloat === 0 ? scaled : Math.fround(scaled + offsetFloat);
  return Math.trunc(shifted) & 0xffff;
}

/** Sine, via Beta's exact lookup table (MathHelper.a(float)). */
export function betaSin(f: number): number {
  return SINE_TABLE[tableIndex(f, 0)]!;
}

/** Cosine, via Beta's exact lookup table (MathHelper.b(float)), phase-shifted sine. */
export function betaCos(f: number): number {
  return SINE_TABLE[tableIndex(f, 16384)]!;
}
