export enum GameMode {
  Survival = 'survival',
  Creative = 'creative',
}

export function parseGameMode(value: unknown): GameMode {
  return value === GameMode.Survival ? GameMode.Survival : GameMode.Creative;
}

export function isCreativeMode(mode: GameMode): boolean {
  return mode === GameMode.Creative;
}

export function isSurvivalMode(mode: GameMode): boolean {
  return mode === GameMode.Survival;
}
