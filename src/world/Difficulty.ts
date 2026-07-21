export const Difficulty = {
  Peaceful: 0,
  Easy: 1,
  Normal: 2,
  Hard: 3,
} as const;

export type Difficulty = typeof Difficulty[keyof typeof Difficulty];

export function isDifficulty(value: unknown): value is Difficulty {
  return Number.isInteger(value) && typeof value === 'number' && value >= 0 && value <= 3;
}
