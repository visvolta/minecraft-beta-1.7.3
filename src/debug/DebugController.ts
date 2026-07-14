import type { CameraController } from '../camera/CameraController';
import type { Input } from '../input/Input';
import type { Player } from '../player/Player';

/**
 * Debug no-clip movement speed, blocks per second — Beta 1.7.3's actual
 * creative-flight speed (chosen over walk speed so no-clip is noticeably
 * faster for flying around and inspecting terrain, per design decision).
 */
export const NOCLIP_SPEED = 10.89;

/** Shift held while in no-clip doubles movement speed (both horizontal and vertical). */
export const NOCLIP_SHIFT_MULTIPLIER = 2;

/**
 * Debug-only free-fly movement, active only while no-clip (F6) is
 * toggled on. Moves the player's real position directly — no separate
 * camera, no separate debug-only position field (see Stage 12D design
 * decision) — bypassing PlayerPhysics entirely (Engine simply does not
 * call PlayerPhysics.update() while no-clip is active, so gravity,
 * player-vs-block collision, and ground acceleration/deceleration never
 * run). WASD moves horizontally relative to camera yaw only (matching
 * Beta's own creative-flight behaviour: pitch does not tilt movement
 * direction); Space/Ctrl move straight up/down as an independent axis.
 *
 * Does not touch rendering, chunk streaming, or block interaction.
 */
export class DebugController {
  private readonly input: Input;
  private readonly camera: CameraController;
  private readonly player: Player;

  public constructor(input: Input, camera: CameraController, player: Player) {
    this.input = input;
    this.camera = camera;
    this.player = player;
  }

  /**
   * Call once per frame instead of PlayerController.update() +
   * PlayerPhysics.update() while no-clip is active.
   */
  public update(deltaSeconds: number): void {
    const yaw = this.camera.getYaw();

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

    let moveY = 0;

    // Space is bound to the "jump" action; reused here as "up" since
    // no-clip has no jumping concept. Ctrl has no InputAction binding
    // (it's debug-only), so it's queried as a held modifier directly.
    if (this.input.isActionActive('jump')) {
      moveY += 1;
    }

    if (this.input.isModifierKeyHeld('ctrl')) {
      moveY -= 1;
    }

    const speed =
      NOCLIP_SPEED * (this.input.isModifierKeyHeld('shift') ? NOCLIP_SHIFT_MULTIPLIER : 1);

    const horizontalLengthSq = moveX * moveX + moveZ * moveZ;

    if (horizontalLengthSq > 0) {
      const horizontalLength = Math.sqrt(horizontalLengthSq);
      this.player.position.x += (moveX / horizontalLength) * speed * deltaSeconds;
      this.player.position.z += (moveZ / horizontalLength) * speed * deltaSeconds;
    }

    if (moveY !== 0) {
      this.player.position.y += moveY * speed * deltaSeconds;
    }
  }

  /**
   * Resets any physics state that would otherwise carry over incorrectly
   * when no-clip is toggled off. Call when enabling no-clip: leftover
   * velocity/grounded state from just before the toggle would otherwise
   * cause a sudden jolt (e.g. residual fall speed) the instant normal
   * PlayerPhysics resumes.
   */
  public resetPhysicsState(): void {
    this.player.velocity.x = 0;
    this.player.velocity.y = 0;
    this.player.velocity.z = 0;
    this.player.wishVelocity.x = 0;
    this.player.wishVelocity.z = 0;
    this.player.grounded = false;
  }
}
