import { Player } from './Player.ts';
import { PlayerModel } from './PlayerModel.ts';
import {
  ANIMATION_ARM_SWING_LIMIT,
  ANIMATION_LEG_SWING_LIMIT,
  ANIMATION_AIRBORNE_ARM_ROTATION,
  ANIMATION_AIRBORNE_LEG_ROTATION,
  ANIMATION_BODY_YAW_FOLLOW_SPEED,
  ANIMATION_IDLE_ARM_X_FREQUENCY,
  ANIMATION_IDLE_ARM_X_AMPLITUDE,
  ANIMATION_IDLE_ARM_Z_FREQUENCY,
  ANIMATION_IDLE_ARM_Z_AMPLITUDE,
  ANIMATION_HEAD_YAW_LIMIT,
  ANIMATION_HEAD_PITCH_LIMIT,
  ANIMATION_PLACEMENT_SWING_STRENGTH
} from './PlayerConstants.ts';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export type PlayerPoseState = 'standing' | 'walking' | 'minecart_sitting';

export function getPlayerPoseState(player: Player): PlayerPoseState {
  if (player.ridingEntity !== null) return 'minecart_sitting';
  const speed = Math.hypot(player.velocity.x, player.velocity.z);
  return speed > 0.05 && player.grounded ? 'walking' : 'standing';
}

function normalizeAngle(angle: number): number {
  let a = angle % (Math.PI * 2);
  if (a < -Math.PI) a += Math.PI * 2;
  if (a > Math.PI) a -= Math.PI * 2;
  return a;
}

export class PlayerAnimator {
  public constructor() {}

  public update(player: Player, model: PlayerModel, headYaw: number, headPitch: number, partialTick: number): void {
    const normalSwing=player.prevSwingProgress+(player.swingProgress-player.prevSwingProgress)*partialTick,breaking=(player.prevBreakingSwingPhase+((player.breakingSwingPhase-player.prevBreakingSwingPhase+1)%1)*partialTick)%1,swingProgress=player.armAction!=='none'?breaking:normalSwing;
    const pose = getPlayerPoseState(player);
    const limbSwingPhase = player.prevLimbSwingPhase + (player.limbSwingPhase - player.prevLimbSwingPhase) * partialTick;
    const limbSwingAmount = pose === 'minecart_sitting' ? 0 : player.prevLimbSwingAmount + (player.limbSwingAmount - player.prevLimbSwingAmount) * partialTick;
    const bodyYaw = player.prevBodyYaw + (player.bodyYaw - player.prevBodyYaw) * partialTick;

    // Body follow head
    let headYawDiff = normalizeAngle(headYaw - bodyYaw);
    if (headYawDiff > ANIMATION_HEAD_YAW_LIMIT) {
      player.bodyYaw = headYaw - ANIMATION_HEAD_YAW_LIMIT;
      headYawDiff = ANIMATION_HEAD_YAW_LIMIT;
    } else if (headYawDiff < -ANIMATION_HEAD_YAW_LIMIT) {
      player.bodyYaw = headYaw + ANIMATION_HEAD_YAW_LIMIT;
      headYawDiff = -ANIMATION_HEAD_YAW_LIMIT;
    }

    const speed = Math.sqrt(player.velocity.x * player.velocity.x + player.velocity.z * player.velocity.z);
    if (speed > 0.1 && player.grounded) {
      player.bodyYaw += headYawDiff * ANIMATION_BODY_YAW_FOLLOW_SPEED;
    }

    // Base transform
    model.updateTransforms(
      player.position.x,
      player.position.y,
      player.position.z,
      bodyYaw,
      headYaw,
      clamp(headPitch, -ANIMATION_HEAD_PITCH_LIMIT, ANIMATION_HEAD_PITCH_LIMIT)
    );

    this.applyPoseBase(model, pose);

    // Walking animation
    let rightArmX = -Math.cos(limbSwingPhase) * ANIMATION_ARM_SWING_LIMIT * limbSwingAmount * 0.5;
    let leftArmX = Math.cos(limbSwingPhase) * ANIMATION_ARM_SWING_LIMIT * limbSwingAmount * 0.5;
    let rightLegX = -Math.cos(limbSwingPhase) * ANIMATION_LEG_SWING_LIMIT * limbSwingAmount;
    let leftLegX = Math.cos(limbSwingPhase) * ANIMATION_LEG_SWING_LIMIT * limbSwingAmount;

    let rightArmZ = 0.0;
    let leftArmZ = 0.0;

    // Idle
    const time = performance.now() / 1000;
    rightArmZ += Math.cos(time * ANIMATION_IDLE_ARM_Z_FREQUENCY) * ANIMATION_IDLE_ARM_Z_AMPLITUDE + ANIMATION_IDLE_ARM_Z_AMPLITUDE;
    leftArmZ -= Math.cos(time * ANIMATION_IDLE_ARM_Z_FREQUENCY) * ANIMATION_IDLE_ARM_Z_AMPLITUDE + ANIMATION_IDLE_ARM_Z_AMPLITUDE;
    rightArmX += Math.sin(time * ANIMATION_IDLE_ARM_X_FREQUENCY) * ANIMATION_IDLE_ARM_X_AMPLITUDE;
    leftArmX -= Math.sin(time * ANIMATION_IDLE_ARM_X_FREQUENCY) * ANIMATION_IDLE_ARM_X_AMPLITUDE;

    // Action Swing
    if (swingProgress > 0) {
      let f = swingProgress;
      f = 1.0 - f;
      f *= f;
      f *= f;
      f = 1.0 - f;
      const f1 = Math.sin(f * Math.PI);
      const f2 = Math.sin(swingProgress * Math.PI) * -(headPitch - 0.7) * 0.75;
      rightArmX += (f1 * 1.2 + f2) * ANIMATION_PLACEMENT_SWING_STRENGTH;
      rightArmZ += Math.sin(swingProgress * Math.PI) * -0.4 * ANIMATION_PLACEMENT_SWING_STRENGTH;
    }

    if (!player.grounded && pose !== 'minecart_sitting') {
      rightArmX += ANIMATION_AIRBORNE_ARM_ROTATION;
      leftArmX += ANIMATION_AIRBORNE_ARM_ROTATION;
      rightLegX += ANIMATION_AIRBORNE_LEG_ROTATION;
      leftLegX += ANIMATION_AIRBORNE_LEG_ROTATION;
    }

    if (pose === 'minecart_sitting') {
      rightLegX = 1.5;
      leftLegX = 1.5;
    }

    model.rightArmGroup.rotation.set(rightArmX, 0, rightArmZ);
    model.leftArmGroup.rotation.set(leftArmX, 0, leftArmZ);
    model.rightLegGroup.rotation.set(rightLegX, 0, 0);
    model.leftLegGroup.rotation.set(leftLegX, 0, 0);
  }

  private applyPoseBase(model: PlayerModel, pose: PlayerPoseState): void {
    const px = 1 / 16;
    model.rightLegGroup.position.set(2 * px, pose === 'minecart_sitting' ? 10 * px : 12 * px, pose === 'minecart_sitting' ? 3 * px : 0);
    model.leftLegGroup.position.set(-2 * px, pose === 'minecart_sitting' ? 10 * px : 12 * px, pose === 'minecart_sitting' ? 3 * px : 0);
  }
}

