import { Player } from './Player.ts';
import { PlayerModel } from './PlayerModel.ts';
import {
  ANIMATION_AIRBORNE_ARM_ROTATION,
  ANIMATION_AIRBORNE_LEG_ROTATION,
  ANIMATION_AIRBORNE_SWING_MULTIPLIER,
  ANIMATION_ARM_SWING_LIMIT,
  ANIMATION_BODY_HEAD_DEADZONE,
  ANIMATION_BODY_HEAD_MAX_DELTA,
  ANIMATION_BODY_TURN_SPEED,
  ANIMATION_FLYING_PITCH_LIMIT,
  ANIMATION_FLYING_SWING_MULTIPLIER,
  ANIMATION_HEAD_PITCH_LIMIT,
  ANIMATION_IDLE_ARM_X_AMPLITUDE,
  ANIMATION_IDLE_ARM_X_FREQUENCY,
  ANIMATION_IDLE_ARM_Z_AMPLITUDE,
  ANIMATION_IDLE_ARM_Z_FREQUENCY,
  ANIMATION_LEG_SWING_LIMIT,
  ANIMATION_MOVEMENT_BODY_TURN_SPEED,
  ANIMATION_PLACEMENT_SWING_STRENGTH,
  ANIMATION_STRAFE_LEAN_LIMIT,
} from './PlayerConstants.ts';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(angle: number): number {
  let a = angle % (Math.PI * 2);
  if (a < -Math.PI) a += Math.PI * 2;
  if (a > Math.PI) a -= Math.PI * 2;
  return a;
}

function stepAngle(current: number, target: number, maxStep: number): number {
  const delta = normalizeAngle(target - current);
  if (Math.abs(delta) <= maxStep) return target;
  return current + Math.sign(delta) * maxStep;
}

export type PlayerAnimationState = 'idle' | 'walking' | 'jumping' | 'falling' | 'flying' | 'minecart_sitting';
export type PlayerPoseState = PlayerAnimationState;

export function getPlayerAnimationState(player: Player): PlayerAnimationState {
  if (player.ridingEntity !== null) return 'minecart_sitting';
  if (player.isFlying) return 'flying';
  if (!player.grounded) return player.velocity.y > 0 ? 'jumping' : 'falling';
  return Math.hypot(player.velocity.x, player.velocity.z) > 0.05 ? 'walking' : 'idle';
}

export const getPlayerPoseState = getPlayerAnimationState;

export class PlayerAnimator {
  public constructor() {}

  public update(player: Player, model: PlayerModel, headYaw: number, headPitch: number, partialTick: number, deltaSeconds = 1 / 60): void {
    const state = getPlayerAnimationState(player);
    const normalSwing=player.prevSwingProgress+(player.swingProgress-player.prevSwingProgress)*partialTick,breaking=(player.prevBreakingSwingPhase+((player.breakingSwingPhase-player.prevBreakingSwingPhase+1)%1)*partialTick)%1,swingProgress=player.armAction!=='none'?breaking:normalSwing;
    const limbSwingPhase = player.prevLimbSwingPhase + (player.limbSwingPhase - player.prevLimbSwingPhase) * partialTick;
    let limbSwingAmount = player.prevLimbSwingAmount + (player.limbSwingAmount - player.prevLimbSwingAmount) * partialTick;
    if (state === 'minecart_sitting') limbSwingAmount = 0;
    else if (state === 'jumping' || state === 'falling') limbSwingAmount *= ANIMATION_AIRBORNE_SWING_MULTIPLIER;
    else if (state === 'flying') limbSwingAmount *= ANIMATION_FLYING_SWING_MULTIPLIER;

    const horizontalSpeed = Math.hypot(player.velocity.x, player.velocity.z);
    const movementYaw = horizontalSpeed > 0.05 ? Math.atan2(player.velocity.x, player.velocity.z) : player.bodyYaw;
    const headDeltaBefore = normalizeAngle(headYaw - player.bodyYaw);
    let bodyTarget = player.bodyYaw;
    const movementForwardBias = Math.abs(Math.cos(normalizeAngle(movementYaw - player.bodyYaw)));
    if (state !== 'minecart_sitting' && horizontalSpeed > 0.08 && movementForwardBias > 0.35) {
      bodyTarget = movementYaw;
    } else if (Math.abs(headDeltaBefore) > ANIMATION_BODY_HEAD_DEADZONE) {
      bodyTarget = headYaw - Math.sign(headDeltaBefore) * ANIMATION_BODY_HEAD_DEADZONE;
    }
    const turnSpeed = (horizontalSpeed > 0.08 ? ANIMATION_MOVEMENT_BODY_TURN_SPEED : ANIMATION_BODY_TURN_SPEED) * deltaSeconds;
    player.bodyYaw = stepAngle(player.bodyYaw, bodyTarget, turnSpeed);
    let headYawDiff = normalizeAngle(headYaw - player.bodyYaw);
    if (headYawDiff > ANIMATION_BODY_HEAD_MAX_DELTA) {
      player.bodyYaw = headYaw - ANIMATION_BODY_HEAD_MAX_DELTA;
      headYawDiff = ANIMATION_BODY_HEAD_MAX_DELTA;
    } else if (headYawDiff < -ANIMATION_BODY_HEAD_MAX_DELTA) {
      player.bodyYaw = headYaw + ANIMATION_BODY_HEAD_MAX_DELTA;
      headYawDiff = -ANIMATION_BODY_HEAD_MAX_DELTA;
    }
    const bodyYaw = player.prevBodyYaw + normalizeAngle(player.bodyYaw - player.prevBodyYaw) * partialTick;

    model.updateTransforms(
      player.position.x,
      player.position.y,
      player.position.z,
      bodyYaw,
      headYaw,
      clamp(headPitch, -ANIMATION_HEAD_PITCH_LIMIT, ANIMATION_HEAD_PITCH_LIMIT)
    );

    this.applyPoseBase(model, state);

    const localForward = horizontalSpeed > 0.001 ? Math.cos(normalizeAngle(movementYaw - bodyYaw)) : 0;
    const localStrafe = horizontalSpeed > 0.001 ? Math.sin(normalizeAngle(movementYaw - bodyYaw)) : 0;
    const backward = localForward < -0.15;
    const phaseDirection = backward ? -1 : 1;
    let rightArmX = -Math.cos(limbSwingPhase * phaseDirection) * ANIMATION_ARM_SWING_LIMIT * limbSwingAmount * 0.5;
    let leftArmX = Math.cos(limbSwingPhase * phaseDirection) * ANIMATION_ARM_SWING_LIMIT * limbSwingAmount * 0.5;
    let rightLegX = -Math.cos(limbSwingPhase * phaseDirection) * ANIMATION_LEG_SWING_LIMIT * limbSwingAmount;
    let leftLegX = Math.cos(limbSwingPhase * phaseDirection) * ANIMATION_LEG_SWING_LIMIT * limbSwingAmount;
    const strafeLean = clamp(localStrafe * limbSwingAmount * ANIMATION_STRAFE_LEAN_LIMIT, -ANIMATION_STRAFE_LEAN_LIMIT, ANIMATION_STRAFE_LEAN_LIMIT);

    let rightArmZ = 0.0;
    let leftArmZ = 0.0;
    const time = performance.now() / 1000;
    rightArmZ += Math.cos(time * ANIMATION_IDLE_ARM_Z_FREQUENCY) * ANIMATION_IDLE_ARM_Z_AMPLITUDE + ANIMATION_IDLE_ARM_Z_AMPLITUDE;
    leftArmZ -= Math.cos(time * ANIMATION_IDLE_ARM_Z_FREQUENCY) * ANIMATION_IDLE_ARM_Z_AMPLITUDE + ANIMATION_IDLE_ARM_Z_AMPLITUDE;
    rightArmX += Math.sin(time * ANIMATION_IDLE_ARM_X_FREQUENCY) * ANIMATION_IDLE_ARM_X_AMPLITUDE;
    leftArmX -= Math.sin(time * ANIMATION_IDLE_ARM_X_FREQUENCY) * ANIMATION_IDLE_ARM_X_AMPLITUDE;

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

    if (state === 'jumping' || state === 'falling') {
      rightArmX += ANIMATION_AIRBORNE_ARM_ROTATION;
      leftArmX += ANIMATION_AIRBORNE_ARM_ROTATION;
      if (limbSwingAmount < 0.05) {
        rightLegX += ANIMATION_AIRBORNE_LEG_ROTATION;
        leftLegX += ANIMATION_AIRBORNE_LEG_ROTATION;
      }
    } else if (state === 'flying') {
      const flyPitch = horizontalSpeed > 0.08 ? -ANIMATION_FLYING_PITCH_LIMIT * clamp(horizontalSpeed / 8, 0, 1) : 0;
      model.bodyGroup.rotation.x = flyPitch;
      model.bodyGroup.rotation.z = -strafeLean;
      rightArmX += flyPitch * 0.4;
      leftArmX += flyPitch * 0.4;
    }

    if (state !== 'flying') {
      model.bodyGroup.rotation.x = 0;
      model.bodyGroup.rotation.z = 0;
    }

    if (state === 'minecart_sitting') {
      rightArmX += -0.62831855;
      leftArmX += -0.62831855;
      rightLegX = -1.2566371;
      leftLegX = -1.2566371;
      model.rightLegGroup.rotation.y = 0.31415927;
      model.leftLegGroup.rotation.y = -0.31415927;
    } else {
      model.rightLegGroup.rotation.y = localStrafe * 0.18 * limbSwingAmount;
      model.leftLegGroup.rotation.y = localStrafe * 0.18 * limbSwingAmount;
    }

    model.rightArmGroup.rotation.set(rightArmX, 0, rightArmZ + strafeLean * 0.4);
    model.leftArmGroup.rotation.set(leftArmX, 0, leftArmZ + strafeLean * 0.4);
    model.rightLegGroup.rotation.x = rightLegX;
    model.leftLegGroup.rotation.x = leftLegX;
  }

  private applyPoseBase(model: PlayerModel, state: PlayerAnimationState): void {
    const px = 1 / 16;
    const sitting = state === 'minecart_sitting';
    model.rightLegGroup.position.set(2 * px, sitting ? 10 * px : 12 * px, sitting ? 3 * px : 0);
    model.leftLegGroup.position.set(-2 * px, sitting ? 10 * px : 12 * px, sitting ? 3 * px : 0);
    if (!sitting) {
      model.rightLegGroup.rotation.y = 0;
      model.leftLegGroup.rotation.y = 0;
    }
  }
}
