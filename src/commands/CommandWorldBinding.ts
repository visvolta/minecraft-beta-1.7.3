/**
 * The world/player surface commands are allowed to touch.
 *
 * Commands must not reach into the Engine directly: that would make the whole
 * engine a dependency of every command and make them untestable. This binding
 * is the single, explicit contract between the command layer and the running
 * world, so a command can only do what is listed here.
 *
 * Every member is optional at the call site via {@link CommandWorldBinding}
 * being absent — commands then report that they are unavailable rather than
 * throwing, which is what happens in headless/validation contexts.
 */

import type { DimensionId } from '../world/dimension/DimensionId';

export interface CommandPlayerHandle {
  /** Current player position in world coordinates. */
  readonly getPosition: () => { readonly x: number; readonly y: number; readonly z: number };
  /** Moves the player. Implementations are responsible for chunk safety. */
  readonly teleport: (x: number, y: number, z: number) => void;
  /** Adds a stack to the inventory; returns how many items were actually taken. */
  readonly giveItem: (id: string | number, type: 'item' | 'block', count: number, metadata: number) => number;
}

export interface CommandWorldHandle {
  /** Total world time in ticks (Beta's `worldTime`). */
  readonly getTimeTicks: () => number;
  /** Sets absolute world time in ticks. */
  readonly setTimeTicks: (ticks: number) => void;
  /** Applies a weather state. `durationTicks` of 0 lets the game choose. */
  readonly setWeather: (weather: 'clear' | 'rain' | 'thunder', durationTicks: number) => void;
  /** Spawns a living entity by its Beta string id; false when unspawnable. */
  readonly summon: (entityStringId: string, x: number, y: number, z: number) => boolean;
  /** Dimension the player currently occupies, for messages and relative coords. */
  readonly getDimension: () => DimensionId;
}

export interface CommandWorldBinding {
  readonly player: CommandPlayerHandle;
  readonly world: CommandWorldHandle;
}
