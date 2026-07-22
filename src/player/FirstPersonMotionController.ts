import { PerspectiveCamera } from 'three';
import { Player } from './Player.ts';
import { FirstPersonArmRenderer } from '../rendering/FirstPersonArmRenderer.ts';
import {
  CAMERA_VIEW_BOB_FREQUENCY,
  CAMERA_VIEW_BOB_HORIZONTAL_AMPLITUDE,
  CAMERA_VIEW_BOB_VERTICAL_AMPLITUDE,
  CAMERA_VIEW_BOB_PITCH_AMPLITUDE,
  CAMERA_VIEW_BOB_ROLL_AMPLITUDE,
  FIRST_PERSON_ARM_BOB_FREQUENCY,
  FIRST_PERSON_ARM_BOB_HORIZONTAL_AMPLITUDE,
  FIRST_PERSON_ARM_BOB_VERTICAL_AMPLITUDE,
  FIRST_PERSON_ARM_BOB_ROLL_AMPLITUDE,
  ANIMATION_SWING_TRANSLATION_X,
  ANIMATION_SWING_TRANSLATION_Y,
  ANIMATION_SWING_TRANSLATION_Z,
  ANIMATION_SWING_PITCH,
  ANIMATION_SWING_YAW,
  ANIMATION_SWING_ROLL,
  FIRST_PERSON_ARM_X,
  FIRST_PERSON_ARM_Y,
  FIRST_PERSON_ARM_Z,
  FIRST_PERSON_ARM_PITCH,
  FIRST_PERSON_ARM_YAW,
  FIRST_PERSON_ARM_ROLL
} from './PlayerConstants.ts';

export class FirstPersonMotionController {
  public constructor() {}

  public update(
    camera: PerspectiveCamera,
    player: Player,
    armRenderer: FirstPersonArmRenderer,
    partialTick: number
  ): void {
    const normalSwing=player.prevSwingProgress+(player.swingProgress-player.prevSwingProgress)*partialTick,breaking=(player.prevBreakingSwingPhase+((player.breakingSwingPhase-player.prevBreakingSwingPhase+1)%1)*partialTick)%1,swingProgress=player.armAction!=='none'?breaking:normalSwing;
    const limbSwingPhase = player.prevLimbSwingPhase + (player.limbSwingPhase - player.prevLimbSwingPhase) * partialTick;
    const rawLimbSwingAmount = player.prevLimbSwingAmount + (player.limbSwingAmount - player.prevLimbSwingAmount) * partialTick;
    const limbSwingAmount = player.grounded && !player.isFlying ? rawLimbSwingAmount : 0;

    // Apply View Bobbing to Camera
    if (limbSwingAmount > 0.001) {
      const transX = Math.sin(limbSwingPhase * CAMERA_VIEW_BOB_FREQUENCY) * limbSwingAmount * CAMERA_VIEW_BOB_HORIZONTAL_AMPLITUDE;
      const transY = -Math.abs(Math.cos(limbSwingPhase * CAMERA_VIEW_BOB_FREQUENCY) * limbSwingAmount * CAMERA_VIEW_BOB_VERTICAL_AMPLITUDE);
      camera.translateX(transX);
      camera.translateY(transY);

      const roll = Math.sin(limbSwingPhase * CAMERA_VIEW_BOB_FREQUENCY) * limbSwingAmount * CAMERA_VIEW_BOB_ROLL_AMPLITUDE;
      const pitch = Math.abs(Math.cos(limbSwingPhase * CAMERA_VIEW_BOB_FREQUENCY - 0.2) * limbSwingAmount) * CAMERA_VIEW_BOB_PITCH_AMPLITUDE;

      camera.rotateZ(roll);
      camera.rotateX(pitch);
    }

    // Combine offsets for First Person Arm
    let bobX = 0;
    let bobY = 0;
    let bobZ = 0;
    let bobPitch = 0;
    let bobYaw = 0;
    let bobRoll = 0;

    // Add first-person walk bob to the arm (offset from camera)
    if (limbSwingAmount > 0.001) {
      bobX = Math.sin(limbSwingPhase * FIRST_PERSON_ARM_BOB_FREQUENCY) * limbSwingAmount * FIRST_PERSON_ARM_BOB_HORIZONTAL_AMPLITUDE;
      bobY = -Math.abs(Math.cos(limbSwingPhase * FIRST_PERSON_ARM_BOB_FREQUENCY) * limbSwingAmount * FIRST_PERSON_ARM_BOB_VERTICAL_AMPLITUDE);
      bobRoll = Math.sin(limbSwingPhase * FIRST_PERSON_ARM_BOB_FREQUENCY) * limbSwingAmount * FIRST_PERSON_ARM_BOB_ROLL_AMPLITUDE;
    }

    let swingX = 0;
    let swingY = 0;
    let swingZ = 0;
    let swingPitch = 0;
    let swingYaw = 0;
    let swingRoll = 0;

    // Add first person swing offsets
    if (swingProgress > 0) {
      const p = swingProgress;
      const sinPI = Math.sin(p * Math.PI);
      const sinSqrtPI = Math.sin(Math.sqrt(p) * Math.PI);

      swingX = ANIMATION_SWING_TRANSLATION_X * sinSqrtPI;
      swingY = ANIMATION_SWING_TRANSLATION_Y * Math.sin(Math.sqrt(p) * Math.PI * 2.0);
      swingZ = ANIMATION_SWING_TRANSLATION_Z * sinPI;

      swingYaw = ANIMATION_SWING_YAW * Math.sin(p * p * Math.PI);
      swingPitch = ANIMATION_SWING_PITCH * sinSqrtPI;
      swingRoll = ANIMATION_SWING_ROLL * sinSqrtPI;
    }

    // Apply combined offsets to arm relative to camera
    armRenderer.armGroup.position.copy(camera.position);
    armRenderer.armGroup.quaternion.copy(camera.quaternion);

    armRenderer.armGroup.translateX(FIRST_PERSON_ARM_X + bobX + swingX);
    armRenderer.armGroup.translateY(FIRST_PERSON_ARM_Y + bobY + swingY);
    armRenderer.armGroup.translateZ(FIRST_PERSON_ARM_Z + bobZ + swingZ);

    armRenderer.armGroup.rotateY(FIRST_PERSON_ARM_YAW + bobYaw + swingYaw);
    armRenderer.armGroup.rotateX(FIRST_PERSON_ARM_PITCH + bobPitch + swingPitch);
    armRenderer.armGroup.rotateZ(FIRST_PERSON_ARM_ROLL + bobRoll + swingRoll);
  }
}
