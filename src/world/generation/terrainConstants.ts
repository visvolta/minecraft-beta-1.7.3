/**
 * Constants verified directly against the decompiled Beta 1.7.3 source
 * (ChunkProviderGenerate, WorldChunkManager). Each is annotated with the
 * exact source expression it corresponds to.
 */

/** World sea level (ChunkProviderGenerate's `byte0 = 64` / `byte1 = 64`). */
export const SEA_LEVEL = 64;

/** Density control-point grid resolution, horizontal (ChunkProviderGenerate's `byte0 = 4` -> 4+1 = 5). */
export const DENSITY_GRID_SIZE_XZ = 5;

/** Density control-point grid resolution, vertical (ChunkProviderGenerate's `byte2 = 17`). */
export const DENSITY_GRID_SIZE_Y = 17;

/** Horizontal blocks per density control-point cell (16 / (DENSITY_GRID_SIZE_XZ - 1)). */
export const DENSITY_CELL_SIZE_XZ = 4;

/** Vertical blocks per density control-point cell (128 / (DENSITY_GRID_SIZE_Y - 1)). */
export const DENSITY_CELL_SIZE_Y = 8;

/** Octave counts for each noise field, from ChunkProviderGenerate's constructor. */
export const OCTAVES_MIN = 16; // field `k`: lower bound of the density blend
export const OCTAVES_MAX = 16; // field `l`: upper bound of the density blend
export const OCTAVES_MAIN = 8; // field `m`: blend-factor ("selector") noise
export const OCTAVES_SURFACE_SAND = 4; // field `n`: reused for sand-patch (and, differently oriented, gravel-patch)
export const OCTAVES_SURFACE_DEPTH = 4; // field `o`: surface (dirt/sand) depth variation
export const OCTAVES_DEPTH = 10; // field `a`: continent/depth noise ("g" array)
export const OCTAVES_HEIGHT_VARIANCE = 16; // field `b`: height-variance noise ("h" array)

/** Horizontal noise scale shared by the min/max/main density fields (684.412). */
export const DENSITY_SCALE_XZ = 684.412;

/** Main-shape noise's extra Y-scale divisor (684.412 / 160, vs /80 for X/Z). */
export const DENSITY_MAIN_Y_DIVISOR = 160;
export const DENSITY_MAIN_XZ_DIVISOR = 80;

/** Continent/depth noise horizontal scale (`1.121D`). */
export const DEPTH_NOISE_SCALE = 1.121;

/** Height-variance noise horizontal scale (`200D`). */
export const HEIGHT_VARIANCE_SCALE = 200;

/** Surface sand/gravel-patch and depth noise base scale (`0.03125D`). */
export const SURFACE_NOISE_SCALE = 0.03125;

/** Fixed Y-plane the gravel-patch noise is sampled on (`109.0134D`), reusing the sand-patch generator with swapped axes. */
export const GRAVEL_NOISE_FIXED_PLANE = 109.0134;
