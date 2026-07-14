import * as THREE from 'three';
import type { Input } from '../input/Input';

const DEG_TO_RAD = Math.PI / 180;
const PITCH_LIMIT = 89 * DEG_TO_RAD;

/** Radians of rotation per pixel of mouse movement. */
const LOOK_SENSITIVITY = 0.002;

/** Free-fly movement speed in world units per second. */
const FLY_SPEED = 10;

/**
 * First-person free-fly camera control for development.
 * Owns rotation and movement; reads input only through the Input API.
 */
export class CameraController {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly input: Input;

  private yaw = 0;
  private pitch = 0;

  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly worldUp = new THREE.Vector3(0, 1, 0);
  private readonly wishDir = new THREE.Vector3();

  public constructor(camera: THREE.PerspectiveCamera, input: Input) {
    this.camera = camera;
    this.input = input;
    this.camera.rotation.order = 'YXZ';
    this.applyRotation();
  }

  public update(deltaSeconds: number): void {
    this.updateLook();
    this.updateMovement(deltaSeconds);
  }

  private updateLook(): void {
    if (!this.input.isPointerLocked()) {
      return;
    }

    const { x: deltaX, y: deltaY } = this.input.consumeMouseDelta();

    this.yaw -= deltaX * LOOK_SENSITIVITY;
    this.pitch -= deltaY * LOOK_SENSITIVITY;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -PITCH_LIMIT, PITCH_LIMIT);

    this.applyRotation();
  }

  private applyRotation(): void {
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.z = 0;
  }

  private updateMovement(deltaSeconds: number): void {
    this.wishDir.set(0, 0, 0);

    this.camera.getWorldDirection(this.forward);
    this.right.crossVectors(this.forward, this.worldUp).normalize();

    if (this.input.isActionActive('forward')) {
      this.wishDir.add(this.forward);
    }

    if (this.input.isActionActive('back')) {
      this.wishDir.sub(this.forward);
    }

    if (this.input.isActionActive('right')) {
      this.wishDir.add(this.right);
    }

    if (this.input.isActionActive('left')) {
      this.wishDir.sub(this.right);
    }

    // World-vertical fly, independent of pitch.
    if (this.input.isActionActive('up')) {
      this.wishDir.y += 1;
    }

    if (this.input.isActionActive('down')) {
      this.wishDir.y -= 1;
    }

    if (this.wishDir.lengthSq() === 0) {
      return;
    }

    this.wishDir.normalize().multiplyScalar(FLY_SPEED * deltaSeconds);
    this.camera.position.add(this.wishDir);
  }
}
