import { Player } from './Player.ts';
import { PlayerModel } from './PlayerModel.ts';
import {
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

  /**
   * @param holdingItem Beta `ModelBiped.heldItemRight`. When the player has
   *   something in hand the right arm is half-swung and tipped forward, which
   *   is what makes a third-person item read as *held* rather than clipped
   *   against a freely swinging arm.
   */
  public update(player: Player, model: PlayerModel, headYaw: number, headPitch: number, partialTick: number, deltaSeconds = 1 / 60, holdingItem = false): void {
    const state = getPlayerAnimationState(player);
    const normalSwing=player.prevSwingProgress+(player.swingProgress-player.prevSwingProgress)*partialTick,breaking=(player.prevBreakingSwingPhase+((player.breakingSwingPhase-player.prevBreakingSwingPhase+1)%1)*partialTick)%1,swingProgress=player.armAction!=='none'?breaking:normalSwing;
    const limbSwingPhase = player.prevLimbSwingPhase + (player.limbSwingPhase - player.prevLimbSwingPhase) * partialTick;
    let limbSwingAmount = player.prevLimbSwingAmount + (player.limbSwingAmount - player.prevLimbSwingAmount) * partialTick;
    if (state === 'minecart_sitting') limbSwingAmount = 0;
    else if (state === 'jumping' || state === 'falling') limbSwingAmount *= ANIMATION_AIRBORNE_SWING_MULTIPLIER;
    else if (state === 'flying') limbSwingAmount *= ANIMATION_FLYING_SWING_MULTIPLIER;

    const horizontalSpeed = Math.hypot(player.velocity.x, player.velocity.z);
    const movementYaw = horizontalSpeed > 0.05 ? Math.atan2(-player.velocity.x, -player.velocity.z) : player.bodyYaw;
    const headDeltaBefore = normalizeAngle(headYaw - player.bodyYaw);
    let bodyTarget = player.bodyYaw;
    const movementDeltaForTarget = normalizeAngle(movementYaw - player.bodyYaw);
    const movementForward = Math.cos(movementDeltaForTarget);
    // While flying the velocity direction swings sharply as the player
    // accelerates and turns, so chasing it made the torso wobble. Beta has no
    // flight, so the calmest correct behaviour is to let the body follow the
    // head only, exactly as it does when standing still.
    const followsMovement = state !== 'minecart_sitting'
      && state !== 'flying'
      && horizontalSpeed > 0.08
      && movementForward > 0.35;
    if (followsMovement) {
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

    const localDelta = normalizeAngle(movementYaw - bodyYaw);
    const localForward = horizontalSpeed > 0.001 ? Math.cos(localDelta) : 0;
    const rawLocalStrafe = horizontalSpeed > 0.001 ? Math.sin(localDelta) : 0;
    const localStrafe = Math.abs(rawLocalStrafe) < 1e-4 ? 0 : rawLocalStrafe;
    const backward = localForward < -0.15;
    const phaseDirection = backward ? -1 : 1;
    let rightArmX = -Math.cos(limbSwingPhase * phaseDirection) * ANIMATION_ARM_SWING_LIMIT * limbSwingAmount * 0.5;
    let leftArmX = Math.cos(limbSwingPhase * phaseDirection) * ANIMATION_ARM_SWING_LIMIT * limbSwingAmount * 0.5;
    let rightLegX = -Math.cos(limbSwingPhase * phaseDirection) * ANIMATION_LEG_SWING_LIMIT * limbSwingAmount;
    let leftLegX = Math.cos(limbSwingPhase * phaseDirection) * ANIMATION_LEG_SWING_LIMIT * limbSwingAmount;
    const strafeLean = clamp(localStrafe * limbSwingAmount * ANIMATION_STRAFE_LEAN_LIMIT, -ANIMATION_STRAFE_LEAN_LIMIT, ANIMATION_STRAFE_LEAN_LIMIT);

    // Beta `ModelBiped.setRotationAngles` composes the arms in a fixed order:
    // base limb swing, then the riding offset, then the held-item pose, and
    // only then the attack swing. Composing them in any other order changes
    // the result because the held-item pose *scales* whatever came before it.
    if (state === 'minecart_sitting') {
      rightArmX += -0.62831855;
      leftArmX += -0.62831855;
    }

    // Beta `heldItemRight`: `rotateAngleX = rotateAngleX * 0.5 - 0.31415927`.
    // Only the right arm is affected; Beta never populates `heldItemLeft`.
    if (holdingItem) {
      rightArmX = rightArmX * 0.5 - 0.31415927;
    }

    let rightArmZ = 0.0;
    let leftArmZ = 0.0;
    // Beta's gentle idle arm sway is a grounded pose. Applying it while
    // airborne or flying compounded with the swing and read as flailing.
    const airborne = state === 'jumping' || state === 'falling' || state === 'flying';
    if (!airborne) {
      const time = performance.now() / 1000;
      rightArmZ += Math.cos(time * ANIMATION_IDLE_ARM_Z_FREQUENCY) * ANIMATION_IDLE_ARM_Z_AMPLITUDE + ANIMATION_IDLE_ARM_Z_AMPLITUDE;
      leftArmZ -= Math.cos(time * ANIMATION_IDLE_ARM_Z_FREQUENCY) * ANIMATION_IDLE_ARM_Z_AMPLITUDE + ANIMATION_IDLE_ARM_Z_AMPLITUDE;
      rightArmX += Math.sin(time * ANIMATION_IDLE_ARM_X_FREQUENCY) * ANIMATION_IDLE_ARM_X_AMPLITUDE;
      leftArmX -= Math.sin(time * ANIMATION_IDLE_ARM_X_FREQUENCY) * ANIMATION_IDLE_ARM_X_AMPLITUDE;
    }

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

    // Beta `ModelBiped.setRotationAngles` applies NO extra arm or leg offset
    // while airborne: the limbs simply follow `limbSwingAmount`, which decays
    // toward zero once the player leaves the ground. The previous constant
    // offset is what pushed the arms visibly backward when jumping/falling.
    //
    // Legs keep a small airborne tuck, which reads correctly and is the one
    // deliberate departure; arms are left to the swing alone.
    if (state === 'jumping' || state === 'falling') {
      if (limbSwingAmount < 0.05) {
        rightLegX += ANIMATION_AIRBORNE_LEG_ROTATION;
        leftLegX += ANIMATION_AIRBORNE_LEG_ROTATION;
      }
      model.bodyGroup.rotation.x = 0;
      model.bodyGroup.rotation.z = 0;
    } else if (state === 'flying') {
      // Creative flight has no Beta equivalent, so keep it deliberately calm:
      // a small steady forward lean with no per-frame sway. Reusing the ground
      // walk's body turn here is what made the torso wobble in the air.
      const flyPitch = -ANIMATION_FLYING_PITCH_LIMIT * clamp(horizontalSpeed / 8, 0, 1);
      model.bodyGroup.rotation.x = flyPitch;
      model.bodyGroup.rotation.z = 0;
    } else {
      model.bodyGroup.rotation.x = 0;
      model.bodyGroup.rotation.z = 0;
    }

    if (state === 'minecart_sitting') {
      // Arms were already tipped back above, in Beta's composition order.
      rightLegX = -1.2566371;
      leftLegX = -1.2566371;
      model.rightLegGroup.rotation.y = 0.31415927;
      model.leftLegGroup.rotation.y = -0.31415927;
    } else {
      model.rightLegGroup.rotation.y = localStrafe * 0.18 * limbSwingAmount;
      model.leftLegGroup.rotation.y = localStrafe * 0.18 * limbSwingAmount;
    }

    const armLean = airborne ? 0 : strafeLean * 0.4;
    model.rightArmGroup.rotation.set(rightArmX, 0, rightArmZ + armLean);
    model.leftArmGroup.rotation.set(leftArmX, 0, leftArmZ + armLean);
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
