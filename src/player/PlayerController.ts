import type { CameraController } from '../camera/CameraController';
import type { Input } from '../input/Input';
import { GRAVITY } from '../physics/physicsConstants';
import type { Player } from './Player';
import {
  CREATIVE_DOUBLE_JUMP_WINDOW_SECONDS,
  CREATIVE_FLIGHT_MAX_SPEED,
} from './PlayerConstants';

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
  private sprintTapWindow=0;
  private jumpTapWindowSeconds = 0;
  private readonly input: Input;
  private readonly camera: CameraController;
  private readonly player: Player;

  public constructor(input: Input, camera: CameraController, player: Player) {
    this.input = input;
    this.camera = camera;
    this.player = player;
  }

  public tickSprintWindow():void{if(this.sprintTapWindow>0)this.sprintTapWindow--;}
  public updateSprintState(forwardHeld:boolean,shiftHeld:boolean,forwardPressed:boolean):void{if(this.player.isFlying){this.player.isSprinting=false;return;}if(forwardPressed){if(this.sprintTapWindow>0&&this.player.canSprint()){this.player.isSprinting=true;this.sprintTapWindow=0;}else this.sprintTapWindow=7;}if(shiftHeld&&forwardHeld&&this.player.canSprint())this.player.isSprinting=true;if(!forwardHeld||!this.player.canSprint()||this.player.collidedHorizontally)this.player.isSprinting=false;}

  /** Reads input and updates the player's wish velocity; applies jumps immediately. */
  public update(deltaSeconds = 0): void {
    if (this.jumpTapWindowSeconds > 0) this.jumpTapWindowSeconds = Math.max(0, this.jumpTapWindowSeconds - deltaSeconds);

    if (this.player.ridingEntity !== null) {
      this.player.wishVelocity.x = 0;
      this.player.wishVelocity.z = 0;
      this.player.isSprinting = false;
      return;
    }
    const yaw = this.camera.getYaw();

    // Camera-relative forward/right on the horizontal plane only.
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);

    let moveX=0,moveZ=0;const forwardHeld=this.input.isActionActive('forward');
    this.updateSprintState(forwardHeld,this.input.isActionActive('sprint'),this.input.isActionJustPressed('forward'));

    if (forwardHeld) {
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
      const speed=this.player.isFlying?CREATIVE_FLIGHT_MAX_SPEED:WALK_SPEED*(this.player.isSprinting?1.3:1);this.player.wishVelocity.x=moveX/length*speed;this.player.wishVelocity.z=moveZ/length*speed;
    } else {
      this.player.wishVelocity.x = 0;
      this.player.wishVelocity.z = 0;
    }

    if (this.input.isActionJustPressed('jump')) {
      if (this.player.canFly() && this.jumpTapWindowSeconds > 0) {
        this.player.isFlying = !this.player.isFlying;
        this.player.velocity.y = 0;
        this.player.fallDistance = 0;
        this.jumpTapWindowSeconds = 0;
        return;
      }
      this.jumpTapWindowSeconds = CREATIVE_DOUBLE_JUMP_WINDOW_SECONDS;
      if (!this.player.isFlying && this.player.grounded) {
        this.player.velocity.y=JUMP_VELOCITY;if(this.player.isSprinting){this.player.velocity.x+=forwardX*1.5;this.player.velocity.z+=forwardZ*1.5;this.player.addExhaustion(.8);}else this.player.addExhaustion(.2);this.player.grounded=false;
      }
    }
  }
}
