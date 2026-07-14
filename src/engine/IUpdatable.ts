/**
 * Optional system updated each frame by the Engine.
 * Core systems (input, camera) are wired explicitly; future systems can register.
 */
export interface IUpdatable {
  update(deltaSeconds: number): void;
}
