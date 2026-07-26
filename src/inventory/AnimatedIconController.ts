import type { ItemTextureAtlas } from '../assets/ItemTextureAtlas';

/**
 * Drives the frame shown for Beta's two state-dependent item icons.
 *
 * Beta renders these procedurally (`TextureCompassFX` rotates a needle toward
 * spawn; `TextureWatchFX` rotates a dial by the celestial angle). This project
 * ships them as pre-rendered vertical frame strips instead, so the equivalent
 * behaviour is to pick the frame matching the same angle. The visible result
 * matches; only the drawing technique differs.
 *
 * Frames run clockwise from frame 0 = needle/dial pointing "up".
 */
export class AnimatedIconController {
  private static readonly COMPASS = 'compass';
  private static readonly CLOCK = 'clock';

  public constructor(private readonly atlas: ItemTextureAtlas) {}

  /**
   * Points the compass needle at the world spawn point, as Beta does via
   * `atan2` between the player's yaw and the direction to spawn.
   *
   * @param playerYawRadians Player look yaw.
   * @param dx Spawn X minus player X.
   * @param dz Spawn Z minus player Z.
   */
  public updateCompass(playerYawRadians: number, dx: number, dz: number): void {
    const frames = this.atlas.getFrameCount(AnimatedIconController.COMPASS);
    if (frames <= 1) return;
    // Angle from the player's facing to the spawn direction.
    const angleToSpawn = Math.atan2(dz, dx);
    const relative = angleToSpawn - playerYawRadians;
    this.atlas.setAnimationFrame(AnimatedIconController.COMPASS, angleToFrame(relative, frames));
  }

  /**
   * Advances the clock dial with the day/night cycle. `celestialAngle` is the
   * same 0..1 value Beta's `World.getCelestialAngle` produces, where 0 is noon.
   */
  public updateClock(celestialAngle: number): void {
    const frames = this.atlas.getFrameCount(AnimatedIconController.CLOCK);
    if (frames <= 1) return;
    const normalized = ((celestialAngle % 1) + 1) % 1;
    this.atlas.setAnimationFrame(AnimatedIconController.CLOCK, Math.floor(normalized * frames));
  }

  /** Points the compass at nothing in particular; used when spawn is unknown. */
  public resetCompass(): void {
    this.atlas.setAnimationFrame(AnimatedIconController.COMPASS, 0);
  }
}

/** Maps a radian angle onto a frame index in a clockwise strip. */
function angleToFrame(radians: number, frames: number): number {
  const turns = radians / (Math.PI * 2);
  const normalized = ((turns % 1) + 1) % 1;
  return Math.floor(normalized * frames) % frames;
}
