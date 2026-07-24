export enum GameMode {
  Survival = 'survival',
  Creative = 'creative',
}

export function parseGameMode(value: unknown): GameMode {
  return value === GameMode.Creative ? GameMode.Creative : GameMode.Survival;
}

export function isCreativeMode(mode: GameMode): boolean {
  return mode === GameMode.Creative;
}

export function isSurvivalMode(mode: GameMode): boolean {
  return mode === GameMode.Survival;
}
