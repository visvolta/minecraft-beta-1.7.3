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

export const ANIMATION_AIRBORNE_ARM_ROTATION = -0.2;
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
