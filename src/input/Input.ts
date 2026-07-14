/**
 * Logical actions the game can query.
 * Key bindings map to these so binds can change later without touching consumers.
 */
export type InputAction =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'up'
  | 'down';

/** Default keyboard bindings. Replace this map later for configurable keybinds. */
const DEFAULT_BINDINGS: Record<InputAction, readonly string[]> = {
  forward: ['KeyW'],
  back: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  up: ['Space'],
  down: ['ShiftLeft', 'ShiftRight'],
};

/**
 * Gathers raw keyboard and mouse input.
 * Knows nothing about the camera, player, or gameplay.
 */
export class Input {
  private readonly keysDown = new Set<string>();
  private readonly bindings: Record<InputAction, readonly string[]>;
  private readonly target: HTMLElement;

  /** Accumulated from events between frames. */
  private pendingMouseDeltaX = 0;
  private pendingMouseDeltaY = 0;

  /** Snapshot taken in beginFrame for this frame's consumers. */
  private frameMouseDeltaX = 0;
  private frameMouseDeltaY = 0;

  private pointerLocked = false;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    this.keysDown.add(event.code);

    // Prevent page scroll when free-flying with Space / arrows, etc.
    if (this.pointerLocked) {
      event.preventDefault();
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keysDown.delete(event.code);
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (!this.pointerLocked) {
      return;
    }

    this.pendingMouseDeltaX += event.movementX;
    this.pendingMouseDeltaY += event.movementY;
  };

  private readonly onClick = (): void => {
    if (!this.pointerLocked) {
      void this.target.requestPointerLock();
    }
  };

  private readonly onPointerLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.target;

    if (!this.pointerLocked) {
      this.clearMouseDeltas();
    }
  };

  private readonly onBlur = (): void => {
    this.keysDown.clear();
    this.clearMouseDeltas();
  };

  public constructor(
    target: HTMLElement,
    bindings: Record<InputAction, readonly string[]> = DEFAULT_BINDINGS,
  ) {
    this.target = target;
    this.bindings = bindings;
  }

  public start(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    this.target.addEventListener('mousemove', this.onMouseMove);
    this.target.addEventListener('click', this.onClick);
  }

  public stop(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    this.target.removeEventListener('mousemove', this.onMouseMove);
    this.target.removeEventListener('click', this.onClick);

    if (document.pointerLockElement === this.target) {
      document.exitPointerLock();
    }

    this.keysDown.clear();
    this.clearMouseDeltas();
    this.pointerLocked = false;
  }

  /**
   * Call once at the start of each frame before systems read input.
   * Snapshots accumulated mouse movement for this frame.
   */
  public beginFrame(): void {
    this.frameMouseDeltaX = this.pendingMouseDeltaX;
    this.frameMouseDeltaY = this.pendingMouseDeltaY;
    this.pendingMouseDeltaX = 0;
    this.pendingMouseDeltaY = 0;
  }

  public isActionActive(action: InputAction): boolean {
    const codes = this.bindings[action];

    for (const code of codes) {
      if (this.keysDown.has(code)) {
        return true;
      }
    }

    return false;
  }

  public isPointerLocked(): boolean {
    return this.pointerLocked;
  }

  /**
   * Returns this frame's mouse movement (from beginFrame), then clears it.
   * Values are in pixels (Pointer Lock movementX / movementY).
   */
  public consumeMouseDelta(): { x: number; y: number } {
    const delta = { x: this.frameMouseDeltaX, y: this.frameMouseDeltaY };
    this.frameMouseDeltaX = 0;
    this.frameMouseDeltaY = 0;
    return delta;
  }

  private clearMouseDeltas(): void {
    this.pendingMouseDeltaX = 0;
    this.pendingMouseDeltaY = 0;
    this.frameMouseDeltaX = 0;
    this.frameMouseDeltaY = 0;
  }
}
