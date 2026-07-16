export const FLUID_LEVEL_MASK = 0x07;
export const FLUID_FALLING_FLAG = 0x08;

export function getFluidLevel(metadata: number): number {
  return metadata & FLUID_LEVEL_MASK;
}

export function isFallingFluid(metadata: number): boolean {
  return (metadata & FLUID_FALLING_FLAG) !== 0;
}

export function fluidMetadata(level: number, falling = false): number {
  const clamped = Math.max(0, Math.min(7, Math.trunc(level)));
  return clamped | (falling ? FLUID_FALLING_FLAG : 0);
}

export function normalizedFluidLevel(metadata: number): number {
  return isFallingFluid(metadata) ? 0 : getFluidLevel(metadata);
}

export function fluidSurfaceHeight(metadata: number): number {
  if (isFallingFluid(metadata)) return 1;
  return 1 - (getFluidLevel(metadata) + 1) / 9;
}
