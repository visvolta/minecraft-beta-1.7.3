/**
 * Shared physics tuning values (Beta 1.7.3 targets).
 * Kept in one place so PlayerController's jump velocity and PlayerPhysics's
 * gravity integration always derive from the same numbers.
 */

/** Downward acceleration in blocks per second squared (~0.08 blocks/tick^2 at 20 ticks/s). */
export const GRAVITY = 32;

/** Maximum downward speed in blocks per second. */
export const TERMINAL_VELOCITY = 78.4;

/**
 * Small skin gap (blocks) kept between the player AABB and block faces
 * during collision resolution, to avoid floating-point jitter (e.g.
 * spurious re-collision immediately after landing).
 */
export const COLLISION_EPSILON = 1e-4;
