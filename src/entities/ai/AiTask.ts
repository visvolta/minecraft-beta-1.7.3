import type { LivingEntity } from '../living/LivingEntity';

/**
 * Mutually-exclusive control channels (Beta-inspired). A higher-priority task
 * holding a channel prevents a lower-priority task that needs the same channel
 * from running, so e.g. wandering (which steers heading) suppresses idle
 * head-turning.
 */
export const ControlFlags = {
  None: 0,
  Move: 1,
  Look: 2,
  Jump: 4,
} as const;

/**
 * A single AI behaviour (Beta's per-tick `updatePlayerActionState` logic,
 * factored into composable tasks). Kept intentionally small — no behaviour
 * tree or ECS, just priority + start/continue/tick/stop.
 */
export interface AiTask {
  /** Higher runs first and claims control channels first. */
  readonly priority: number;
  /** Control channels this task occupies while running. */
  readonly controlFlags: number;
  shouldStart(entity: LivingEntity): boolean;
  shouldContinue(entity: LivingEntity): boolean;
  start(entity: LivingEntity): void;
  tick(entity: LivingEntity): void;
  stop(entity: LivingEntity): void;
}
