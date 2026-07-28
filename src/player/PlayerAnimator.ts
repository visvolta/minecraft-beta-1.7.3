import { Player } from './Player.ts';
import { PlayerModel } from './PlayerModel.ts';
import {
  ANIMATION_HEAD_PITCH_LIMIT,
  ANIMATION_IDLE_ARM_X_AMPLITUDE,
  ANIMATION_IDLE_ARM_Z_AMPLITUDE,
  ANIMATION_PLACEMENT_SWING_STRENGTH,
  BETA_ARM_SWING_AMPLITUDE,
  BETA_ARM_SWING_SCALE,
  BETA_HELD_ITEM_ARM_OFFSET,
  BETA_HELD_ITEM_ARM_SCALE,
  BETA_LEG_SWING_AMPLITUDE,
  BETA_LIMB_FREQUENCY,
  BETA_RIDING_ARM_X,
  BETA_RIDING_LEG_X,
  BETA_RIDING_LEG_Y,
  HAND_ATTACHMENT_POSITION,
  HAND_ATTACHMENT_ROTATION,
  PLAYER_MODEL_SCALE,
} from './PlayerConstants.ts';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function wrapRadians(angle: number): number {
  let a = angle % (Math.PI * 2);
  if (a < -Math.PI) a += Math.PI * 2;
  if (a >= Math.PI) a -= Math.PI * 2;
  return a;
}

export type PlayerAnimationState = 'idle' | 'walking' | 'jumping' | 'falling' | 'flying' | 'minecart_sitting';
export type PlayerPoseState = PlayerAnimationState;
export type ThirdPersonHeldPose = 'none' | 'block' | 'flat' | 'tool' | 'bow' | 'fishing_rod' | 'food' | 'use';

interface PoseAccumulator {
  rightArmX: number;
  rightArmY: number;
  rightArmZ: number;
  leftArmX: number;
  leftArmY: number;
  leftArmZ: number;
  rightLegX: number;
  rightLegY: number;
  rightLegZ: number;
  leftLegX: number;
  leftLegY: number;
  leftLegZ: number;
  bodyX: number;
  bodyZ: number;
}

export function getPlayerAnimationState(player: Player): PlayerAnimationState {
  if (player.ridingEntity !== null) return 'minecart_sitting';
  if (player.isFlying) return 'flying';
  if (!player.grounded) return player.velocity.y > 0 ? 'jumping' : 'falling';
  return Math.hypot(player.velocity.x, player.velocity.z) > 0.05 ? 'walking' : 'idle';
}

export const getPlayerPoseState = getPlayerAnimationState;

/**
 * Third-person player animation composer.
 *
 * This intentionally owns the complete biped pose order. Every frame starts
 * from the rig's known neutral pose, applies layers in a fixed sequence, and
 * only then leaves the hand attachment in the final arm-local space for the
 * held-item renderer. No other third-person system should directly mutate the
 * arm/body/leg transforms after this runs.
 */
export class PlayerAnimator {
  public update(
    player: Player,
    model: PlayerModel,
    headYaw: number,
    headPitch: number,
    partialTick: number,
    _deltaSeconds = 1 / 60,
    holdingItem = false,
    heldPose: ThirdPersonHeldPose = holdingItem ? 'tool' : 'none',
  ): void {
    const state = getPlayerAnimationState(player);
    const pose = this.basePose(model, state);

    const bodyYaw = player.prevBodyYaw + wrapRadians(player.bodyYaw - player.prevBodyYaw) * partialTick;
    const clampedHeadPitch = clamp(headPitch, -ANIMATION_HEAD_PITCH_LIMIT, ANIMATION_HEAD_PITCH_LIMIT);
    model.updateTransforms(player.position.x, player.position.y, player.position.z, bodyYaw, headYaw, clampedHeadPitch);

    this.applyLocomotion(player, pose, state, partialTick);
    this.applyAirborneAndFlying(player, pose, state);
    this.applyHeldItemPose(player, pose, heldPose);
    this.applyUsePose(player, pose, heldPose, clampedHeadPitch);
    this.applyAttackOverlay(player, pose, clampedHeadPitch, partialTick);
    this.commitPose(model, pose, state);
  }

  /** Base pose: all rotations and pose-dependent offsets reset every frame. */
  private basePose(model: PlayerModel, state: PlayerAnimationState): PoseAccumulator {
    const px = PLAYER_MODEL_SCALE;
    const sitting = state === 'minecart_sitting';

    model.headGroup.rotation.set(0, 0, 0);
    model.bodyGroup.rotation.set(0, 0, 0);
    model.rightArmGroup.rotation.set(0, 0, 0);
    model.leftArmGroup.rotation.set(0, 0, 0);
    model.rightLegGroup.rotation.set(0, 0, 0);
    model.leftLegGroup.rotation.set(0, 0, 0);

    model.headGroup.position.set(0, 24 * px, 0);
    model.bodyGroup.position.set(0, 24 * px, 0);
    model.rightArmGroup.position.set(6 * px, 24 * px, 0);
    model.leftArmGroup.position.set(-6 * px, 24 * px, 0);
    model.rightLegGroup.position.set(2 * px, sitting ? 10 * px : 12 * px, sitting ? 3 * px : 0);
    model.leftLegGroup.position.set(-2 * px, sitting ? 10 * px : 12 * px, sitting ? 3 * px : 0);

    model.rightHandAttachment.position.set(...HAND_ATTACHMENT_POSITION);
    model.rightHandAttachment.rotation.set(...HAND_ATTACHMENT_ROTATION);

    return {
      rightArmX: 0, rightArmY: 0, rightArmZ: 0,
      leftArmX: 0, leftArmY: 0, leftArmZ: 0,
      rightLegX: 0, rightLegY: 0, rightLegZ: 0,
      leftLegX: 0, leftLegY: 0, leftLegZ: 0,
      bodyX: 0, bodyZ: 0,
    };
  }

  private applyLocomotion(player: Player, pose: PoseAccumulator, state: PlayerAnimationState, partialTick: number): void {
    const limbSwingPhase = player.prevLimbSwingPhase + (player.limbSwingPhase - player.prevLimbSwingPhase) * partialTick;
    let limbSwingAmount = player.prevLimbSwingAmount + (player.limbSwingAmount - player.prevLimbSwingAmount) * partialTick;

    if (state === 'minecart_sitting') limbSwingAmount = 0;
    if (state === 'jumping' || state === 'falling') limbSwingAmount *= 0.25;
    if (state === 'flying') limbSwingAmount *= 0.35;

    const phase = limbSwingPhase * BETA_LIMB_FREQUENCY;
    const armAmplitude = BETA_ARM_SWING_AMPLITUDE * limbSwingAmount * BETA_ARM_SWING_SCALE;
    const legAmplitude = BETA_LEG_SWING_AMPLITUDE * limbSwingAmount;

    pose.rightArmX += Math.cos(phase + Math.PI) * armAmplitude;
    pose.leftArmX += Math.cos(phase) * armAmplitude;
    pose.rightLegX += Math.cos(phase) * legAmplitude;
    pose.leftLegX += Math.cos(phase + Math.PI) * legAmplitude;

    if (state === 'idle' || state === 'walking') {
      const time = player.animationAgeTicks;
      pose.rightArmZ += Math.cos(time * 0.09) * ANIMATION_IDLE_ARM_Z_AMPLITUDE + ANIMATION_IDLE_ARM_Z_AMPLITUDE;
      pose.leftArmZ -= Math.cos(time * 0.09) * ANIMATION_IDLE_ARM_Z_AMPLITUDE + ANIMATION_IDLE_ARM_Z_AMPLITUDE;
      pose.rightArmX += Math.sin(time * 0.067) * ANIMATION_IDLE_ARM_X_AMPLITUDE;
      pose.leftArmX -= Math.sin(time * 0.067) * ANIMATION_IDLE_ARM_X_AMPLITUDE;
    }
  }

  private applyAirborneAndFlying(_player: Player, pose: PoseAccumulator, state: PlayerAnimationState): void {
    if (state === 'jumping' || state === 'falling') {
      return;
    }

    if (state === 'flying') {
      // Keep torso upright; flying affects limbs only so body yaw remains authoritative.
      pose.rightArmX *= 0.5;
      pose.leftArmX *= 0.5;
      pose.rightLegX *= 0.5;
      pose.leftLegX *= 0.5;
      return;
    }

    if (state === 'minecart_sitting') {
      pose.rightArmX += BETA_RIDING_ARM_X;
      pose.leftArmX += BETA_RIDING_ARM_X;
      pose.rightLegX = BETA_RIDING_LEG_X;
      pose.leftLegX = BETA_RIDING_LEG_X;
      pose.rightLegY = BETA_RIDING_LEG_Y;
      pose.leftLegY = -BETA_RIDING_LEG_Y;
    }
  }

  private applyHeldItemPose(player: Player, pose: PoseAccumulator, heldPose: ThirdPersonHeldPose): void {
    if (heldPose === 'none') return;

    pose.rightArmX = pose.rightArmX * BETA_HELD_ITEM_ARM_SCALE + BETA_HELD_ITEM_ARM_OFFSET;

    if (heldPose === 'bow') {
      pose.rightArmX = -1.15;
      pose.rightArmY = -0.15;
      pose.leftArmX = -0.95;
      pose.leftArmY = 0.25;
    } else if (heldPose === 'fishing_rod') {
      pose.rightArmX = -0.85;
      pose.rightArmY = -0.1;
    } else if (heldPose === 'food' || player.isEating) {
      pose.rightArmX = -1.05;
      pose.rightArmY = -0.15;
      pose.rightArmZ = 0.1;
    }
  }

  private applyUsePose(player: Player, pose: PoseAccumulator, heldPose: ThirdPersonHeldPose, headPitch: number): void {
    if (!player.isEating && heldPose !== 'use') return;
    pose.rightArmX = Math.min(pose.rightArmX, -1.1 + headPitch * 0.25);
    pose.rightArmY -= 0.1;
    pose.rightArmZ += 0.12;
  }

  private applyAttackOverlay(player: Player, pose: PoseAccumulator, headPitch: number, partialTick: number): void {
    const normalSwing = player.prevSwingProgress + (player.swingProgress - player.prevSwingProgress) * partialTick;
    const breaking = (player.prevBreakingSwingPhase + ((player.breakingSwingPhase - player.prevBreakingSwingPhase + 1) % 1) * partialTick) % 1;
    const swingProgress = player.armAction !== 'none' ? breaking : normalSwing;
    if (swingProgress <= 0) return;

    let f = 1 - swingProgress;
    f *= f;
    f *= f;
    f = 1 - f;
    const swing = Math.sin(f * Math.PI);
    const pitchBlend = Math.sin(swingProgress * Math.PI) * -(headPitch - 0.7) * 0.75;
    pose.rightArmX += (swing * 1.2 + pitchBlend) * ANIMATION_PLACEMENT_SWING_STRENGTH;
    pose.rightArmZ += Math.sin(swingProgress * Math.PI) * -0.4 * ANIMATION_PLACEMENT_SWING_STRENGTH;
  }

  private commitPose(model: PlayerModel, pose: PoseAccumulator, state: PlayerAnimationState): void {
    model.bodyGroup.rotation.x = pose.bodyX;
    model.bodyGroup.rotation.z = pose.bodyZ;
    model.rightArmGroup.rotation.set(pose.rightArmX, pose.rightArmY, pose.rightArmZ);
    model.leftArmGroup.rotation.set(pose.leftArmX, pose.leftArmY, pose.leftArmZ);
    model.rightLegGroup.rotation.set(pose.rightLegX, pose.rightLegY, pose.rightLegZ);
    model.leftLegGroup.rotation.set(pose.leftLegX, pose.leftLegY, pose.leftLegZ);

    if (state !== 'minecart_sitting') {
      model.rightLegGroup.rotation.y = pose.rightLegY;
      model.leftLegGroup.rotation.y = pose.leftLegY;
    }
  }
}
