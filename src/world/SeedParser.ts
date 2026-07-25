const SIGNED_64_MASK = (1n << 64n) - 1n;
const SIGNED_64_MAX = (1n << 63n) - 1n;

export interface ParsedWorldSeed {
  readonly seedText: string;
  readonly seed: string;
}

export function parseWorldSeed(input: string, randomSource: () => bigint = defaultRandomSeed): ParsedWorldSeed {
  const seedText = input;
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { seedText, seed: String(toSigned64(randomSource())) };
  }
  if (/^[+-]?\d+$/.test(trimmed)) {
    return { seedText, seed: String(toSigned64(BigInt(trimmed))) };
  }
  return { seedText, seed: String(javaStringHash64(trimmed)) };
}

export function javaStringHash64(value: string): bigint {
  let hash = 0n;
  for (let i = 0; i < value.length; i++) {
    hash = toSigned64(hash * 31n + BigInt(value.charCodeAt(i)));
  }
  return hash;
}

function toSigned64(value: bigint): bigint {
  const unsigned = value & SIGNED_64_MASK;
  return unsigned > SIGNED_64_MAX ? unsigned - (1n << 64n) : unsigned;
}

function defaultRandomSeed(): bigint {
  const hi = BigInt(Math.floor(Math.random() * 0x1_0000_0000));
  const lo = BigInt(Math.floor(Math.random() * 0x1_0000_0000));
  return (hi << 32n) | lo;
}
