import { fluidSurfaceHeight, isSourceOrFullHeight } from '../../world/fluid/FluidMetadata';

export interface FluidSurfaceAccess {
  getBlock(x: number, y: number, z: number): number;
  getMetadata(x: number, y: number, z: number): number;
  isSameFluid(a: number, b: number): boolean;
  isSolidForFluidHeight(blockId: number): boolean;
}

/**
 * Beta RenderBlocks.func_1224_a, expressed as pure data sampling.
 *
 * Coordinates identify the current fluid corner. The four samples are the
 * current cell and the three cells touching that corner. Source/falling
 * samples receive Beta's tenfold full-height weighting; this is deliberately
 * not the flow-obstruction predicate used by FluidBehaviour.
 */
export function getBetaFluidCornerHeight(
  access: FluidSurfaceAccess,
  x: number,
  y: number,
  z: number,
  fluidBlockId: number,
): number {
  let total = 0;
  let weight = 0;

  const samples: ReadonlyArray<readonly [number, number]> = [
    [x, z],
    [x - 1, z],
    [x, z - 1],
    [x - 1, z - 1],
  ];

  for (const [sampleX, sampleZ] of samples) {
    if (access.isSameFluid(fluidBlockId, access.getBlock(sampleX, y + 1, sampleZ))) {
      return 1;
    }

    const sampleId = access.getBlock(sampleX, y, sampleZ);
    if (access.isSameFluid(fluidBlockId, sampleId)) {
      const metadata = access.getMetadata(sampleX, y, sampleZ);
      const height = fluidSurfaceHeight(metadata);
      if (isSourceOrFullHeight(metadata)) {
        total += height * 10;
        weight += 10;
      }
      total += height;
      weight += 1;
    } else if (!access.isSolidForFluidHeight(sampleId)) {
      total += 1;
      weight += 1;
    }
  }

  return weight === 0 ? 1 : total / weight;
}
