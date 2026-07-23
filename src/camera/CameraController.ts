import * as THREE from 'three';
import type { Input } from '../input/Input';
import type { GameSettings } from '../settings/GameSettings';

const DEG_TO_RAD = Math.PI / 180;
const PITCH_LIMIT = 89 * DEG_TO_RAD;

/** Radians of rotation per pixel of mouse movement. */
const LOOK_SENSITIVITY = 0.002;

/**
 * First-person camera look control.
 * Owns rotation only — position is driven externally (by the player's eye
 * position); this class knows nothing about movement, physics, or collision.
 */
export class CameraController {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly input: Input;

  private yaw = 0;
  private pitch = 0;
  private settings: GameSettings | undefined;

  public constructor(camera: THREE.PerspectiveCamera, input: Input, settings?: GameSettings) {
    this.camera = camera;
    this.input = input;
    this.settings = settings;
    this.camera.rotation.order = 'YXZ';
    this.applyRotation();
  }

  public update(): void {
    if (!this.input.isPointerLocked()) {
      return;
    }

    const { x: deltaX, y: deltaY } = this.input.consumeMouseDelta();

    const multiplier = 0.25 + (this.settings?.mouse.sensitivity ?? 0.5) * 1.75;
    const invert = this.settings?.mouse.invertY === true ? -1 : 1;
    this.yaw -= deltaX * LOOK_SENSITIVITY * multiplier;
    this.pitch -= deltaY * LOOK_SENSITIVITY * multiplier * invert;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -PITCH_LIMIT, PITCH_LIMIT);

    this.applyRotation();
  }

  public setSettings(settings: GameSettings): void { this.settings = settings; }
  /** Current yaw in radians, needed by PlayerController to move relative to look direction. */
  public getYaw(): number { return this.yaw; }
  public getPitch(): number { return this.pitch; }
  /** Restores persisted view before the first frame. */
  public setRotation(yaw: number, pitch: number): void { this.yaw = yaw; this.pitch = THREE.MathUtils.clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT); this.applyRotation(); }

  private applyRotation(): void {
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.z = 0;
  }
}
