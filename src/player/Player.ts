import { AABB } from '../physics/AABB';
import {
  ANIMATION_SWING_DURATION_SECONDS,
  ANIMATION_MOVEMENT_SPEED_SCALING,
  ANIMATION_RETURN_TO_NEUTRAL_SPEED,
  ANIMATION_WALK_SWING_FREQUENCY
} from './PlayerConstants.ts';

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

  public distanceWalkedModified = 0;
  public prevDistanceWalkedModified = 0;

  public isSwinging = false;
  public swingProgressInt = 0;
  public swingProgress = 0;
  public prevSwingProgress = 0;

  public limbSwingAmount = 0;
  public prevLimbSwingAmount = 0;
  public limbSwingPhase = 0;
  public prevLimbSwingPhase = 0;
  public swingTime = 0;

  public bodyYaw = 0;
  public prevBodyYaw = 0;

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

  public swingItem(): void {
    this.swingTime = 0;
    this.isSwinging = true;
  }

  public updateAnimationState(deltaSeconds: number): void {
    this.prevLimbSwingPhase = this.limbSwingPhase;
    this.prevLimbSwingAmount = this.limbSwingAmount;
    this.prevSwingProgress = this.swingProgress;
    this.prevBodyYaw = this.bodyYaw;

    const speed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
    let targetSwingAmount = 0;
    if (this.grounded && speed > 0.05) {
      targetSwingAmount = Math.min(speed * ANIMATION_MOVEMENT_SPEED_SCALING, 1.0);
    }

    const deltaSwing = targetSwingAmount - this.limbSwingAmount;
    this.limbSwingAmount += deltaSwing * ANIMATION_RETURN_TO_NEUTRAL_SPEED * deltaSeconds;

    // Phase advances based on smoothed swing amount
    this.limbSwingPhase += this.limbSwingAmount * ANIMATION_WALK_SWING_FREQUENCY * deltaSeconds * 20.0;

    if (this.isSwinging) {
      this.swingTime += deltaSeconds;
      if (this.swingTime >= ANIMATION_SWING_DURATION_SECONDS) {
        this.swingTime = 0;
        this.isSwinging = false;
      }
    } else {
      this.swingTime = 0;
    }

    this.swingProgress = this.swingTime / ANIMATION_SWING_DURATION_SECONDS;
  }
}
