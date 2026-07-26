import { BlockIds } from '../blocks/BlockId';

/**
 * Beta's per-block ambient sounds, driven by `randomDisplayTick`.
 *
 * Beta calls `randomDisplayTick` on random blocks within a 16-block cube
 * around the camera every client tick, and each block rolls its own chance:
 *
 *   `BlockFire.randomDisplayTick`  — 1/24  "fire.fire",
 *                                    volume 1.0 + rand, pitch rand*0.7 + 0.3
 *   `BlockFluid.randomDisplayTick` — 1/64  "liquid.water" but ONLY for
 *                                    *flowing* water (metadata 1..7),
 *                                    volume rand*0.25 + 0.75,
 *                                    pitch rand*1.0 + 0.5
 *                                  — 1/100 lava surface effect (particles in
 *                                    Beta; this project also emits the
 *                                    shipped `liquid.lava` / `liquid.lavapop`
 *                                    ambience at the same rate)
 *
 * Crucially these are one-shot positional sounds emitted at the block, not a
 * global loop: they stop naturally when the block is gone or out of range,
 * and several nearby blocks each roll independently.
 */

/** Beta samples `randomDisplayTick` candidates in a 16-block cube. */
export const AMBIENT_SAMPLE_RADIUS = 16;
/** How many random cells to sample per tick. Beta uses 1000 across the cube. */
export const AMBIENT_SAMPLES_PER_TICK = 250;

/** Beta `BlockFire.randomDisplayTick`: `rand.nextInt(24) == 0`. */
export const FIRE_SOUND_CHANCE = 24;
/** Beta water ambience: `rand.nextInt(64) == 0`, flowing water only. */
export const WATER_SOUND_CHANCE = 64;
/** Beta lava surface tick: `rand.nextInt(100) == 0`. */
export const LAVA_SOUND_CHANCE = 100;

export interface AmbientSound {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly volume: number;
  readonly pitch: number;
}

export interface AmbientBlockAudioWorld {
  getBlock(x: number, y: number, z: number): number;
  getBlockMetadata(x: number, y: number, z: number): number;
}

/**
 * Rolls Beta's ambient sound chances for one block cell.
 *
 * Returns the sound to emit, or `undefined`. Pure and deterministic given
 * `random`, so it can be unit-tested without audio hardware.
 */
export function ambientSoundForBlock(
  world: AmbientBlockAudioWorld,
  x: number,
  y: number,
  z: number,
  random: () => number,
): AmbientSound | undefined {
  const blockId = world.getBlock(x, y, z);

  if (blockId === BlockIds.Fire) {
    if (Math.floor(random() * FIRE_SOUND_CHANCE) !== 0) return undefined;
    return {
      id: 'fire.fire',
      x: x + 0.5, y: y + 0.5, z: z + 0.5,
      // Beta: volume 1.0F + rand, pitch rand * 0.7F + 0.3F
      volume: 1 + random(),
      pitch: random() * 0.7 + 0.3,
    };
  }

  if (blockId === BlockIds.WaterFlowing || blockId === BlockIds.WaterStill) {
    // Beta only plays water ambience for FLOWING water: metadata 1..7.
    // A still source (metadata 0) is silent, which is why a calm lake does
    // not hiss.
    const metadata = world.getBlockMetadata(x, y, z);
    if (metadata <= 0 || metadata >= 8) return undefined;
    if (Math.floor(random() * WATER_SOUND_CHANCE) !== 0) return undefined;
    return {
      id: 'liquid.water',
      x: x + 0.5, y: y + 0.5, z: z + 0.5,
      // Beta: volume rand * 0.25F + 0.75F, pitch rand * 1.0F + 0.5F
      volume: random() * 0.25 + 0.75,
      pitch: random() * 1 + 0.5,
    };
  }

  if (blockId === BlockIds.LavaFlowing || blockId === BlockIds.LavaStill) {
    // Beta gates the lava surface effect on open air above the block.
    const above = world.getBlock(x, y + 1, z);
    if (above !== BlockIds.Air) return undefined;
    if (Math.floor(random() * LAVA_SOUND_CHANCE) !== 0) return undefined;
    // Beta spawns a particle here; the shipped audio set also provides
    // `liquid.lava` (bed ambience) and `liquid.lavapop` (the pop that
    // accompanies the particle). Pop is the rarer of the two.
    const pop = random() < 0.25;
    return {
      id: pop ? 'liquid.lavapop' : 'liquid.lava',
      x: x + 0.5, y: y + 0.5, z: z + 0.5,
      volume: pop ? 0.5 : 0.2 + random() * 0.2,
      pitch: pop ? 2.6 + (random() - random()) * 0.8 : random() * 0.5 + 0.75,
    };
  }

  return undefined;
}

/**
 * Samples random cells around the camera and yields the ambient sounds that
 * should play this tick, mirroring Beta's `randomDisplayTick` dispatch.
 */
export function collectAmbientSounds(
  world: AmbientBlockAudioWorld,
  cameraX: number,
  cameraY: number,
  cameraZ: number,
  random: () => number,
  samples = AMBIENT_SAMPLES_PER_TICK,
  radius = AMBIENT_SAMPLE_RADIUS,
): AmbientSound[] {
  const out: AmbientSound[] = [];
  const baseX = Math.floor(cameraX);
  const baseY = Math.floor(cameraY);
  const baseZ = Math.floor(cameraZ);
  const span = radius * 2;
  for (let i = 0; i < samples; i++) {
    const x = baseX + Math.floor(random() * span) - radius;
    const y = baseY + Math.floor(random() * span) - radius;
    const z = baseZ + Math.floor(random() * span) - radius;
    if (y < 0 || y >= 128) continue;
    const sound = ambientSoundForBlock(world, x, y, z, random);
    if (sound !== undefined) out.push(sound);
  }
  return out;
}
