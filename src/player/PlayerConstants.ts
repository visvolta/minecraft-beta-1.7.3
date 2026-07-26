/** Player rendering constants mirroring Beta 1.7.3 dimensions and behaviour. */

// 1 model pixel = 1/16 of a block
export const PLAYER_MODEL_SCALE = 1 / 16;

/** Shoulder offset Y relative to the arm mesh center. Centers the pivot exactly at the neck height. */
export const PLAYER_MODEL_SHOULDER_OFFSET_Y = -6 * PLAYER_MODEL_SCALE;

// First-person arm transform constants (Default resting pose)
export const FIRST_PERSON_ARM_X = 0.65;
export const FIRST_PERSON_ARM_Y = -.4;
export const FIRST_PERSON_ARM_Z = -0.8;
export const FIRST_PERSON_ARM_PITCH = -Math.PI / 3.5;
export const FIRST_PERSON_ARM_YAW = -Math.PI / 16;
export const FIRST_PERSON_ARM_ROLL = Math.PI / 32;
export const FIRST_PERSON_ARM_SCALE = .75;

// First-person local camera offset relative to player body position
export const FIRST_PERSON_CAMERA_OFFSET_X = 0.0;
export const FIRST_PERSON_CAMERA_OFFSET_Y = 1.62;
export const FIRST_PERSON_CAMERA_OFFSET_Z = 0.0;

// Third-person camera constants
export const THIRD_PERSON_DISTANCE = 4.0;

// By default, the camera targets exactly the eye level.
export const THIRD_PERSON_TARGET_OFFSET_Y = 0.0;

// --- Held Block and Outer Layer Tuning Constants ---
// Category 1: 3D held blocks (`block3d`)
export const HELD_BLOCK_POSITION_X = 0.28;
export const HELD_BLOCK_POSITION_Y = -0.04;
export const HELD_BLOCK_POSITION_Z = -0.40;
export const HELD_BLOCK_ROTATION_X = 0.45;
export const HELD_BLOCK_ROTATION_Y = 0.80;
export const HELD_BLOCK_ROTATION_Z = 0.10;
export const HELD_BLOCK_SCALE = 0.62;

// Category 2: Flat held items (`flatItem`)
export const HELD_FLAT_POSITION_X = .3;
export const HELD_FLAT_POSITION_Y = .1;
export const HELD_FLAT_POSITION_Z = -0.0;
export const HELD_FLAT_ROTATION_X = 0.10;
export const HELD_FLAT_ROTATION_Y = -0.30;
export const HELD_FLAT_ROTATION_Z = 3;
export const HELD_FLAT_SCALE = 0.65;

// Category 3: Held tools (`tool`)
export const HELD_TOOL_POSITION_X = 0.3;
export const HELD_TOOL_POSITION_Y = 0.10;
export const HELD_TOOL_POSITION_Z = 0.0;
export const HELD_TOOL_ROTATION_X = -0.6;
export const HELD_TOOL_ROTATION_Y = 1.6;
export const HELD_TOOL_ROTATION_Z = 4.5;
export const HELD_TOOL_SCALE = 0.60;

// Legacy held block tuning constants (retained for compatibility)
export const FIRST_PERSON_HELD_BLOCK_X = 0.3;
export const FIRST_PERSON_HELD_BLOCK_Y = 2 * PLAYER_MODEL_SCALE;
export const FIRST_PERSON_HELD_BLOCK_Z = -6 * PLAYER_MODEL_SCALE;
export const FIRST_PERSON_HELD_BLOCK_PITCH = 4;
export const FIRST_PERSON_HELD_BLOCK_YAW = Math.PI / 3.5;
export const FIRST_PERSON_HELD_BLOCK_ROLL = 35;
export const FIRST_PERSON_HELD_BLOCK_SCALE = .7;

export const THIRD_PERSON_HELD_BLOCK_X = 0;
export const THIRD_PERSON_HELD_BLOCK_Y = -10 * PLAYER_MODEL_SCALE;
export const THIRD_PERSON_HELD_BLOCK_Z = -2 * PLAYER_MODEL_SCALE;
export const THIRD_PERSON_HELD_BLOCK_PITCH = 0;
export const THIRD_PERSON_HELD_BLOCK_YAW = 0;
export const THIRD_PERSON_HELD_BLOCK_ROLL = 0;
export const THIRD_PERSON_HELD_BLOCK_SCALE = 0.35;

// ===========================================================================
// Third-person held items — single source of tuning truth
// ===========================================================================
//
// Beta reference: `RenderPlayer.renderSpecials`. It calls
// `modelBipedMain.bipedRightArm.postRender(0.0625F)` (moving into the right
// arm's local space, pivot at the shoulder) and then:
//
//     glTranslatef(-0.0625F, 0.4375F, 0.0625F)      // -> the hand/wrist
//
// then one of three category transforms:
//
//   3D block:  translate(0, 0.1875, -0.3125); scale 0.5*0.75; rotX 20; rotY 45
//   full-3D:   translate(0, 0.1875, 0);       scale 0.625;    rotX -100; rotY 45
//   flat item: translate(0.25, 0.1875, -0.1875); scale 0.375;
//              rotZ 60; rotX -90; rotZ 20
//
// IMPORTANT AXIS NOTE: Beta's model space has +Y pointing DOWN, and its
// `glScalef(s, -s, s)` flips Y again for the item quad. Three.js is +Y up, so
// every Beta Y translation is negated here and the scale stays positive.
//
// All values below are in Three.js space (metres, +Y up), derived from the
// Beta numbers above. Renderers must read these and never hardcode their own.

/** Beta model unit: 1/16 of a block. Beta's `0.0625F`. */
const U = PLAYER_MODEL_SCALE;

/**
 * Right-hand attachment, relative to the right arm group whose pivot is the
 * shoulder.
 *
 * Beta: `glTranslatef(-0.0625, 0.4375, 0.0625)` = 1 unit toward the body,
 * 7 units DOWN the arm, 1 unit forward. Seven units down from the shoulder is
 * the wrist — the arm box itself is 12 units long.
 *
 * The previous value used `SHOULDER_OFFSET_Y * 2` (-12 units), which put the
 * attachment past the fingertips at roughly leg height. That is why held
 * items rendered down by the player's leg.
 */
export const HAND_ATTACHMENT_POSITION: readonly [number, number, number] =
  [-1 * U, -7 * U, 1 * U];
/** Beta applies no extra rotation at the wrist itself. */
export const HAND_ATTACHMENT_ROTATION: readonly [number, number, number] = [0, 0, 0];

/** Beta 3D-block branch: translate(0, 0.1875, -0.3125), scale 0.5 * 0.75. */
export const THIRD_PERSON_BLOCK_POSITION: readonly [number, number, number] =
  [0, -3 * U, -5 * U];
export const THIRD_PERSON_BLOCK_ROTATION: readonly [number, number, number] =
  [20 * Math.PI / 180, 45 * Math.PI / 180, 0];
export const THIRD_PERSON_BLOCK_SCALE = 0.5 * 0.75;

/**
 * Beta flat-item branch: translate(0.25, 0.1875, -0.1875), scale 0.375, then
 * rotZ 60, rotX -90, rotZ 20. The composed Z rotation is 60 + 20 = 80 degrees.
 */
export const THIRD_PERSON_FLAT_POSITION: readonly [number, number, number] =
  [4 * U, -3 * U, -3 * U];
export const THIRD_PERSON_FLAT_ROTATION: readonly [number, number, number] =
  [-90 * Math.PI / 180, 0, 80 * Math.PI / 180];
export const THIRD_PERSON_FLAT_SCALE = 0.375;

/**
 * Beta full-3D branch (`Item.isFull3D()`), used by swords and tools: they are
 * held along the arm rather than flat across the palm.
 */
export const THIRD_PERSON_TOOL_POSITION: readonly [number, number, number] =
  [0, -3 * U, 0];
export const THIRD_PERSON_TOOL_ROTATION: readonly [number, number, number] =
  [-100 * Math.PI / 180, 45 * Math.PI / 180, 0];
export const THIRD_PERSON_TOOL_SCALE = 0.625;

/** Bow: Beta treats it as full-3D, angled slightly further forward. */
export const THIRD_PERSON_BOW_POSITION: readonly [number, number, number] =
  [0, -3 * U, 1 * U];
export const THIRD_PERSON_BOW_ROTATION: readonly [number, number, number] =
  [-100 * Math.PI / 180, 35 * Math.PI / 180, 0];
export const THIRD_PERSON_BOW_SCALE = 0.625;

/**
 * Fishing rod: Beta swaps the held model to a stick while a bobber is out
 * (`if (var1.fishEntity != null) var21 = new ItemStack(Item.stick)`), and the
 * line is anchored at the rod tip rather than the body.
 */
export const THIRD_PERSON_ROD_POSITION: readonly [number, number, number] =
  [0, -3 * U, 0];
export const THIRD_PERSON_ROD_ROTATION: readonly [number, number, number] =
  [-100 * Math.PI / 180, 45 * Math.PI / 180, 0];
export const THIRD_PERSON_ROD_SCALE = 0.625;
/**
 * Rod-tip offset from the hand attachment, in the attachment's local space.
 * The fishing line starts here so it visually leaves the rod rather than the
 * player's chest.
 */
export const ROD_TIP_OFFSET: readonly [number, number, number] =
  [0, -2 * U, -11 * U];

/**
 * First-person rod tip, relative to the first-person arm group. Shares the
 * same purpose as `ROD_TIP_OFFSET` so both views anchor the line consistently.
 */
export const FIRST_PERSON_ROD_TIP_OFFSET: readonly [number, number, number] =
  [0.34, -0.12, -0.72];

/**
 * Extra pose applied to the held item while the arm is mid-swing, so the item
 * tracks the hand instead of appearing to lag behind it.
 */
export const HELD_ITEM_SWING_POSITION_SCALE = 1;
export const HELD_ITEM_USE_FORWARD_OFFSET = 2 * U;

// ===========================================================================
// Beta limb-swing / body-yaw tuning (EntityLiving.onUpdate)
// ===========================================================================
//
// These reproduce Beta's animation driver verbatim. They are the reason
// strafing, turning, direction changes and backwards walking read correctly:
// Beta derives the walk cycle from the actual position delta and turns the
// body toward the direction of travel, rather than from forward speed alone.

/** Beta `var5 > 0.05F`: minimum per-tick movement that starts the walk cycle. */
export const BETA_LIMB_SWING_MOVE_THRESHOLD = 0.05;
/** Beta `var7 = var5 * 3.0F`: distance moved converts to walk-cycle phase. */
export const BETA_LIMB_SWING_DISTANCE_SCALE = 3;
/** Beta `field_9361_v += (var8 - field_9361_v) * 0.3F`. */
export const BETA_LIMB_SWING_SMOOTHING = 0.3;
/** Beta `renderYawOffset += var9 * 0.3F`: body chases travel direction. */
export const BETA_BODY_YAW_FOLLOW = 0.3;
/** Beta clamps head/body separation to +/-75 degrees. */
export const BETA_BODY_HEAD_CLAMP = 75;
/** Beta `var10 * var10 > 2500` (i.e. |delta| > 50 degrees) drags the body. */
export const BETA_BODY_DRAG_THRESHOLD_SQUARED = 2500;
/** Beta `renderYawOffset += var10 * 0.2F` once past the drag threshold. */
export const BETA_BODY_DRAG_RATE = 0.2;

/** Beta `ModelBiped`: arm swing frequency multiplier (`var1 * 0.6662F`). */
export const BETA_LIMB_FREQUENCY = 0.6662;
/** Beta arm amplitude: `cos(...) * 2.0F * var2 * 0.5F`. */
export const BETA_ARM_SWING_AMPLITUDE = 2.0;
export const BETA_ARM_SWING_SCALE = 0.5;
/** Beta leg amplitude: `cos(...) * 1.4F * var2`. */
export const BETA_LEG_SWING_AMPLITUDE = 1.4;
/** Beta `heldItemRight`: `rotateAngleX = rotateAngleX * 0.5F - 0.31415927F`. */
export const BETA_HELD_ITEM_ARM_SCALE = 0.5;
export const BETA_HELD_ITEM_ARM_OFFSET = -0.31415927;
/** Beta riding pose: arms -0.62831855, legs -1.2566371 with +/-0.31415927 yaw. */
export const BETA_RIDING_ARM_X = -0.62831855;
export const BETA_RIDING_LEG_X = -1.2566371;
export const BETA_RIDING_LEG_Y = 0.31415927;

export const PLAYER_OUTER_LAYER_SCALE = 1.05;

// --- Animation Tuning Constants ---

export const ANIMATION_WALK_SWING_FREQUENCY = 0.586;
export const ANIMATION_ARM_SWING_LIMIT = .6;
export const ANIMATION_LEG_SWING_LIMIT = .6;
export const ANIMATION_MOVEMENT_SPEED_SCALING = 0.3; // Dampens swing amplitude relative to walk speed
export const ANIMATION_RETURN_TO_NEUTRAL_SPEED = 10.0; // Interpolation speed when stopped

export const ANIMATION_HEAD_YAW_LIMIT = 90.0 * Math.PI / 180.0;
export const ANIMATION_HEAD_PITCH_LIMIT = 90.0 * Math.PI / 180.0;
export const ANIMATION_BODY_YAW_FOLLOW_SPEED = 0.3;

export const ANIMATION_IDLE_ARM_Z_FREQUENCY = 1.8;
export const ANIMATION_IDLE_ARM_Z_AMPLITUDE = 0.05;
export const ANIMATION_IDLE_ARM_X_FREQUENCY = 1.34;
export const ANIMATION_IDLE_ARM_X_AMPLITUDE = 0.05;

/**
 * Unused: Beta applies no airborne arm offset (see ModelBiped). Kept at 0 so
 * any future caller cannot reintroduce the backward-arm pose by accident.
 */
export const ANIMATION_AIRBORNE_ARM_ROTATION = 0;
export const ANIMATION_AIRBORNE_LEG_ROTATION = -0.2;

// View Bobbing (Camera)
export const CAMERA_VIEW_BOB_HORIZONTAL_AMPLITUDE = 0.01;
export const CAMERA_VIEW_BOB_VERTICAL_AMPLITUDE = 0.01;
export const CAMERA_VIEW_BOB_ROLL_AMPLITUDE = .3 * Math.PI / 180.0;
export const CAMERA_VIEW_BOB_PITCH_AMPLITUDE = .3 * Math.PI / 180.0;
export const CAMERA_VIEW_BOB_FREQUENCY = .7;

// View Bobbing (First Person Arm)
export const FIRST_PERSON_ARM_BOB_HORIZONTAL_AMPLITUDE = 0.01;
export const FIRST_PERSON_ARM_BOB_VERTICAL_AMPLITUDE = 0.01;
export const FIRST_PERSON_ARM_BOB_ROLL_AMPLITUDE = .3 * Math.PI / 180.0;
export const FIRST_PERSON_ARM_BOB_FREQUENCY = .7;

export const ANIMATION_SWING_DURATION_SECONDS = .2; // 8 ticks * 0.05s

export const ANIMATION_SWING_TRANSLATION_X = -0.4;
export const ANIMATION_SWING_TRANSLATION_Y = 0.01;
export const ANIMATION_SWING_TRANSLATION_Z = 0.2;

export const ANIMATION_SWING_PITCH = -20 * Math.PI / 180.0;
export const ANIMATION_SWING_YAW = 0 * Math.PI / 180.0;
export const ANIMATION_SWING_ROLL = 5 * Math.PI / 180.0;

export const ANIMATION_PLACEMENT_SWING_STRENGTH = 1;

// ---- Melee combat (Stage 7C) ----
/** Beta entity-targeting reach: capped at 3.0 blocks (and at the block-hit distance). */
export const MELEE_REACH = 3.0;
/** Base bare-hand player melee damage (Beta fist = 1 half-heart). Centralized, no weapon bonuses. */
export const PLAYER_MELEE_DAMAGE = 1;

// Creative flight tuning (project extension; Beta 1.7.3 has no full modern Creative flight).
export const CREATIVE_DOUBLE_JUMP_WINDOW_SECONDS = 0.28;
export const CREATIVE_FLIGHT_ACCELERATION = 35;
export const CREATIVE_FLIGHT_MAX_SPEED = 8.0;
export const CREATIVE_FLIGHT_VERTICAL_SPEED = 5.5;
export const CREATIVE_FLIGHT_DRAG_PER_SECOND = 10;

// Player render animation tuning.
export const ANIMATION_BODY_HEAD_DEADZONE = Math.PI / 3;
export const ANIMATION_BODY_HEAD_MAX_DELTA = Math.PI * 0.62;
export const ANIMATION_BODY_TURN_SPEED = 8.5;
export const ANIMATION_MOVEMENT_BODY_TURN_SPEED = 10.5;
export const ANIMATION_AIRBORNE_SWING_MULTIPLIER = 0.55;
export const ANIMATION_FLYING_SWING_MULTIPLIER = 0.45;
export const ANIMATION_STRAFE_LEAN_LIMIT = 0.16;
export const ANIMATION_FLYING_PITCH_LIMIT = 0.28;
