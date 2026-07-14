import type { CameraController } from '../camera/CameraController';
import type { Input } from '../input/Input';
import { GRAVITY } from '../physics/physicsConstants';
import type { Player } from './Player';

/** Beta 1.7.3 walk speed, blocks per second. */
export const WALK_SPEED = 4.317;

/** Target jump apex height, blocks. */
export const JUMP_HEIGHT = 1.2522;

/**
 * Upward velocity needed to reach JUMP_HEIGHT under constant gravity,
 * derived from v = sqrt(2 * g * h) rather than a hardcoded, unrelated
 * constant. Recomputes automatically if GRAVITY or JUMP_HEIGHT change.
 */
export const JUMP_VELOCITY = Math.sqrt(2 * GRAVITY * JUMP_HEIGHT);

/**
 * Reads movement input relative to camera yaw and drives the player's
 * wish velocity and jumping. Does not touch gravity or collision —
 * PlayerPhysics consumes wishVelocity and integrates/resolves movement.
 */
export class PlayerController {
  private readonly input: Input;
  private readonly camera: CameraController;
  private readonly player: Player;

  public constructor(input: Input, camera: CameraController, player: Player) {
    this.input = input;
    this.camera = camera;
    this.player = player;
  }

  /** Reads input and updates the player's wish velocity; applies jumps immediately. */
  public update(): void {
    const yaw = this.camera.getYaw();

    // Camera-relative forward/right on the horizontal plane only.
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);

    let moveX = 0;
    let moveZ = 0;

    if (this.input.isActionActive('forward')) {
      moveX += forwardX;
      moveZ += forwardZ;
    }

    if (this.input.isActionActive('back')) {
      moveX -= forwardX;
      moveZ -= forwardZ;
    }

    if (this.input.isActionActive('right')) {
      moveX += rightX;
      moveZ += rightZ;
    }

    if (this.input.isActionActive('left')) {
      moveX -= rightX;
      moveZ -= rightZ;
    }

    const lengthSq = moveX * moveX + moveZ * moveZ;

    if (lengthSq > 0) {
      const length = Math.sqrt(lengthSq);
      this.player.wishVelocity.x = (moveX / length) * WALK_SPEED;
      this.player.wishVelocity.z = (moveZ / length) * WALK_SPEED;
    } else {
      this.player.wishVelocity.x = 0;
      this.player.wishVelocity.z = 0;
    }

    // Jumping only takes effect while grounded; grounded itself is only
    // ever set by PlayerPhysics's collision resolution from the previous
    // physics step (this runs before physics in the frame order).
    if (this.input.isActionActive('jump') && this.player.grounded) {
      this.player.velocity.y = JUMP_VELOCITY;
      this.player.grounded = false;
    }
  }
}
