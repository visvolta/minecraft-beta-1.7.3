import { AABB } from '../physics/AABB';

/** Player hitbox width and depth (blocks). */
export const PLAYER_WIDTH = 0.6;

/** Player hitbox height (blocks). */
export const PLAYER_HEIGHT = 1.8;

/** Camera height above the player's feet (blocks). */
export const PLAYER_EYE_HEIGHT = 1.62;

/**
 * Player position, velocity, and grounded state.
 * Data only: movement input lives in PlayerController, physics/collision
 * lives in PlayerPhysics.
 *
 * Position is the feet centre (bottom-centre of the hitbox), matching
 * Beta's own convention and keeping ground/eye-height math simple.
 */
export class Player {
  /** Feet position (bottom-centre of the hitbox), world space. */
  public readonly position = { x: 0, y: 0, z: 0 };

  /** Current velocity, blocks per second. */
  public readonly velocity = { x: 0, y: 0, z: 0 };

  /**
   * Horizontal velocity movement input is steering toward, set each frame
   * by PlayerController and consumed by PlayerPhysics. Not applied directly;
   * PlayerPhysics accelerates the real velocity toward this value so
   * momentum is preserved (especially in the air).
   */
  public readonly wishVelocity = { x: 0, z: 0 };

  /** True only while resting on a solid block (set by PlayerPhysics). */
  public grounded = false;

  public constructor(spawnX: number, spawnY: number, spawnZ: number) {
    this.position.x = spawnX;
    this.position.y = spawnY;
    this.position.z = spawnZ;
  }

  /** World-space eye position (for the camera), derived from feet position. */
  public getEyeY(): number {
    return this.position.y + PLAYER_EYE_HEIGHT;
  }

  /** Current world-space AABB derived from feet position and fixed dimensions. */
  public getAABB(): AABB {
    const halfWidth = PLAYER_WIDTH / 2;

    return new AABB(
      this.position.x - halfWidth,
      this.position.y,
      this.position.z - halfWidth,
      this.position.x + halfWidth,
      this.position.y + PLAYER_HEIGHT,
      this.position.z + halfWidth,
    );
  }
}
