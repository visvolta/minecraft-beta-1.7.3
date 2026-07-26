import { Player } from './Player.ts';
import { PlayerModel } from './PlayerModel.ts';
import {
  ANIMATION_AIRBORNE_LEG_ROTATION,
  ANIMATION_AIRBORNE_SWING_MULTIPLIER,
  ANIMATION_FLYING_PITCH_LIMIT,
  ANIMATION_FLYING_SWING_MULTIPLIER,
  ANIMATION_HEAD_PITCH_LIMIT,
  ANIMATION_IDLE_ARM_X_AMPLITUDE,
  ANIMATION_IDLE_ARM_X_FREQUENCY,
  ANIMATION_IDLE_ARM_Z_AMPLITUDE,
  ANIMATION_IDLE_ARM_Z_FREQUENCY,
  ANIMATION_PLACEMENT_SWING_STRENGTH,
  BETA_LIMB_FREQUENCY,
  BETA_ARM_SWING_AMPLITUDE,
  BETA_ARM_SWING_SCALE,
  BETA_LEG_SWING_AMPLITUDE,
  BETA_HELD_ITEM_ARM_SCALE,
  BETA_HELD_ITEM_ARM_OFFSET,
  BETA_RIDING_ARM_X,
  BETA_RIDING_LEG_X,
  BETA_RIDING_LEG_Y,
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
  public update(player: Player, model: PlayerModel, headYaw: number, headPitch: number, partialTick: number, _deltaSeconds = 1 / 60, holdingItem = false): void {
    const state = getPlayerAnimationState(player);
    const normalSwing=player.prevSwingProgress+(player.swingProgress-player.prevSwingProgress)*partialTick,breaking=(player.prevBreakingSwingPhase+((player.breakingSwingPhase-player.prevBreakingSwingPhase+1)%1)*partialTick)%1,swingProgress=player.armAction!=='none'?breaking:normalSwing;
    const limbSwingPhase = player.prevLimbSwingPhase + (player.limbSwingPhase - player.prevLimbSwingPhase) * partialTick;
    let limbSwingAmount = player.prevLimbSwingAmount + (player.limbSwingAmount - player.prevLimbSwingAmount) * partialTick;
    if (state === 'minecart_sitting') limbSwingAmount = 0;
    else if (state === 'jumping' || state === 'falling') limbSwingAmount *= ANIMATION_AIRBORNE_SWING_MULTIPLIER;
    else if (state === 'flying') limbSwingAmount *= ANIMATION_FLYING_SWING_MULTIPLIER;

    // Body yaw is computed authoritatively in `Player.updateAnimationState`
    // using Beta's `EntityLiving.onUpdate` algorithm (travel-direction chase,
    // +/-75 degree head clamp, 50 degree drag). The animator must NOT
    // recompute it: doing so previously produced a second, conflicting body
    // rotation that made turning and strafing look wrong.
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

    // Beta `ModelBiped.setRotationAngles`, verbatim:
    //
    //   rightArm.rotateAngleX = cos(limbSwing * 0.6662 + PI) * 2.0 * amount * 0.5
    //   leftArm.rotateAngleX  = cos(limbSwing * 0.6662)      * 2.0 * amount * 0.5
    //   rightLeg.rotateAngleX = cos(limbSwing * 0.6662)      * 1.4 * amount
    //   leftLeg.rotateAngleX  = cos(limbSwing * 0.6662 + PI) * 1.4 * amount
    //
    // The walk direction (forwards vs backwards) and the strafe/turn response
    // are already baked into `limbSwingPhase` and `bodyYaw` by
    // `Player.updateAnimationState`, which follows Beta's driver exactly. The
    // animator therefore reads them rather than re-deriving direction from
    // forward speed, which is what previously broke strafing.
    const phase = limbSwingPhase * BETA_LIMB_FREQUENCY;
    const armAmplitude = BETA_ARM_SWING_AMPLITUDE * limbSwingAmount * BETA_ARM_SWING_SCALE;
    const legAmplitude = BETA_LEG_SWING_AMPLITUDE * limbSwingAmount;
    let rightArmX = Math.cos(phase + Math.PI) * armAmplitude;
    let leftArmX = Math.cos(phase) * armAmplitude;
    let rightLegX = Math.cos(phase) * legAmplitude;
    let leftLegX = Math.cos(phase + Math.PI) * legAmplitude;

    // Beta `ModelBiped.setRotationAngles` composes the arms in a fixed order:
    // base limb swing, then the riding offset, then the held-item pose, and
    // only then the attack swing. Composing them in any other order changes
    // the result because the held-item pose *scales* whatever came before it.
    if (state === 'minecart_sitting') {
      rightArmX += BETA_RIDING_ARM_X;
      leftArmX += BETA_RIDING_ARM_X;
    }

    // Beta `heldItemRight`: `rotateAngleX = rotateAngleX * 0.5 - 0.31415927`.
    // Only the right arm is affected; Beta never populates `heldItemLeft`.
    if (holdingItem) {
      rightArmX = rightArmX * BETA_HELD_ITEM_ARM_SCALE + BETA_HELD_ITEM_ARM_OFFSET;
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
      const flySpeed = Math.hypot(player.velocity.x, player.velocity.z);
      const flyPitch = -ANIMATION_FLYING_PITCH_LIMIT * clamp(flySpeed / 8, 0, 1);
      model.bodyGroup.rotation.x = flyPitch;
      model.bodyGroup.rotation.z = 0;
    } else {
      model.bodyGroup.rotation.x = 0;
      model.bodyGroup.rotation.z = 0;
    }

    if (state === 'minecart_sitting') {
      // Arms were already tipped back above, in Beta's composition order.
      rightLegX = BETA_RIDING_LEG_X;
      leftLegX = BETA_RIDING_LEG_X;
      model.rightLegGroup.rotation.y = BETA_RIDING_LEG_Y;
      model.leftLegGroup.rotation.y = -BETA_RIDING_LEG_Y;
    } else {
      // Beta zeroes leg yaw except while riding.
      model.rightLegGroup.rotation.y = 0;
      model.leftLegGroup.rotation.y = 0;
    }

    // Beta sets arm yaw to 0 and applies no strafe lean: the body yaw itself
    // already turns the whole torso toward the direction of travel.
    model.rightArmGroup.rotation.set(rightArmX, 0, rightArmZ);
    model.leftArmGroup.rotation.set(leftArmX, 0, leftArmZ);
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
