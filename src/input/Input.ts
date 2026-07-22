/**
 * Logical actions the game can query.
 * Key bindings map to these so binds can change later without touching consumers.
 */
export type InputAction =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'jump'
  | 'sprint';

/** Default keyboard bindings. Replace this map later for configurable keybinds. */
const DEFAULT_BINDINGS: Record<InputAction, readonly string[]> = {
  forward: ['KeyW'],
  back: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  jump: ['Space'],
  sprint:['ShiftLeft','ShiftRight'],
};

/** Mouse buttons the game can query, by their MouseEvent.button index. */
export type MouseButton = 'left' | 'right';

const MOUSE_BUTTON_INDEX: Record<MouseButton, number> = {
  left: 0,
  right: 2,
};

/**
 * Digit keys 1-6, reserved for simple block selection in this stage.
 * Slot 6 has no block mapped to it yet; the binding still exists so the
 * input API doesn't need to change again when a 6th slot is added later.
 */
export type DigitKey = '1' | '2' | '3' | '4' | '5' | '6';

const DIGIT_KEY_CODES: Record<DigitKey, string> = {
  '1': 'Digit1',
  '2': 'Digit2',
  '3': 'Digit3',
  '4': 'Digit4',
  '5': 'Digit5',
  '6': 'Digit6',
};

/**
 * Debug-only function keys: F3 toggles the debug overlay, F4 toggles
 * raw-light debug rendering, and F7 toggles AO-only debug rendering.
 * Edge-triggered like the digit keys above, not
 * bound through the InputAction system since they control debug systems
 * rather than gameplay.
 */
/**
 * Debug function keys. F3/F4/F7 are the original set; Stage 18 adds
 * F5/F8/F9/F10 for weather debug controls:
 *   F5  = return to automatic weather
 *   F8  = force clear
 *   F9  = force rain
 *   F10 = force thunder
 */
export type DebugKey = 'F2' | 'F3' | 'F4' | 'F5' | 'F7' | 'F8' | 'F9' | 'F10';

const DEBUG_KEY_CODES: Record<DebugKey, string> = {
  F2: 'F2',
  F3: 'F3',
  F4: 'F4',
  F5: 'F5',
  F7: 'F7',
  F8: 'F8',
  F9: 'F9',
  F10: 'F10',
};

/**
 * Modifier keys queried as simple held-state (not edge-triggered), used by
 * debug no-clip (Shift = 2x speed) and left available generically. Checks
 * both left/right variants of each modifier.
 */
export type ModifierKey = 'shift' | 'ctrl';

const MODIFIER_KEY_CODES: Record<ModifierKey, readonly string[]> = {
  shift: ['ShiftLeft', 'ShiftRight'],
  ctrl: ['ControlLeft', 'ControlRight'],
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

  /** Mouse buttons currently held down, by MouseEvent.button index. */
  private readonly mouseButtonsDown = new Set<number>();

  /** Button-down events seen since the last beginFrame. */
  private readonly pendingMousePresses = new Set<number>();

  /** Snapshot of pendingMousePresses for this frame's consumers. */
  private readonly frameMousePresses = new Set<number>();

  /** Key codes with a (non-repeat) keydown event since the last beginFrame. */
  private readonly pendingKeyPresses = new Set<string>();

  /** Snapshot of pendingKeyPresses for this frame's consumers. */
  private readonly frameKeyPresses = new Set<string>();

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!event.repeat) {
      this.pendingKeyPresses.add(event.code);
    }

    this.keysDown.add(event.code);

    // Prevent page scroll when jumping with Space / using arrows, etc.
    if (this.pointerLocked) {
      event.preventDefault();
    }

    // Debug toggles must reach the game even without pointer lock (e.g.
    // right after page load, before the first click), and must never
    // trigger the browser's own F-key behaviour.
    if (
      event.code === DEBUG_KEY_CODES.F3 ||
      event.code === DEBUG_KEY_CODES.F4 ||
      event.code === DEBUG_KEY_CODES.F5 ||
      event.code === DEBUG_KEY_CODES.F7 ||
      event.code === DEBUG_KEY_CODES.F8 ||
      event.code === DEBUG_KEY_CODES.F9 ||
      event.code === DEBUG_KEY_CODES.F10 ||
      event.code === 'ArrowLeft' ||
      event.code === 'ArrowRight' ||
      event.code === 'ArrowUp' ||
      event.code === 'ArrowDown'
    ) {
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

  private readonly onMouseDown = (event: MouseEvent): void => {
    if (!this.pointerLocked) {
      // The very first click only requests Pointer Lock (see onClick);
      // it should not also register as a gameplay break/place action.
      return;
    }

    if (!this.mouseButtonsDown.has(event.button)) {
      this.pendingMousePresses.add(event.button);
    }

    this.mouseButtonsDown.add(event.button);
  };

  private readonly onMouseUp = (event: MouseEvent): void => {
    this.mouseButtonsDown.delete(event.button);
  };

  private readonly onContextMenu = (event: MouseEvent): void => {
    // Right mouse button is used for placing blocks; never show the
    // browser's context menu over the game canvas.
    event.preventDefault();
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
      this.mouseButtonsDown.clear();
      this.pendingMousePresses.clear();
      this.frameMousePresses.clear();
    }
  };

  private readonly onBlur = (): void => {
    this.keysDown.clear();
    this.mouseButtonsDown.clear();
    this.pendingMousePresses.clear();
    this.frameMousePresses.clear();
    this.pendingKeyPresses.clear();
    this.frameKeyPresses.clear();
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
    this.target.addEventListener('mousedown', this.onMouseDown);
    this.target.addEventListener('mouseup', this.onMouseUp);
    this.target.addEventListener('contextmenu', this.onContextMenu);
    this.target.addEventListener('click', this.onClick);
  }

  public stop(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    this.target.removeEventListener('mousemove', this.onMouseMove);
    this.target.removeEventListener('mousedown', this.onMouseDown);
    this.target.removeEventListener('mouseup', this.onMouseUp);
    this.target.removeEventListener('contextmenu', this.onContextMenu);
    this.target.removeEventListener('click', this.onClick);

    if (document.pointerLockElement === this.target) {
      document.exitPointerLock();
    }

    this.keysDown.clear();
    this.mouseButtonsDown.clear();
    this.pendingMousePresses.clear();
    this.frameMousePresses.clear();
    this.pendingKeyPresses.clear();
    this.frameKeyPresses.clear();
    this.clearMouseDeltas();
    this.pointerLocked = false;
  }

  /**
   * Call once at the start of each frame before systems read input.
   * Snapshots accumulated mouse movement and edge-triggered presses for
   * this frame's consumers.
   */
  public beginFrame(): void {
    this.frameMouseDeltaX = this.pendingMouseDeltaX;
    this.frameMouseDeltaY = this.pendingMouseDeltaY;
    this.pendingMouseDeltaX = 0;
    this.pendingMouseDeltaY = 0;

    this.frameMousePresses.clear();
    for (const button of this.pendingMousePresses) {
      this.frameMousePresses.add(button);
    }
    this.pendingMousePresses.clear();

    this.frameKeyPresses.clear();
    for (const code of this.pendingKeyPresses) {
      this.frameKeyPresses.add(code);
    }
    this.pendingKeyPresses.clear();
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
   * True while the given mouse button is held down (continuous state).
   */
  public isMouseButtonPressed(button: MouseButton): boolean {
    return this.mouseButtonsDown.has(MOUSE_BUTTON_INDEX[button]);
  }

  /**
   * True only on the frame a mouse button transitioned from up to down
   * (edge-triggered), so a held button doesn't repeat the action every frame.
   */
  public isMouseButtonJustPressed(button: MouseButton): boolean {
    return this.frameMousePresses.has(MOUSE_BUTTON_INDEX[button]);
  }

  /**
   * True only on the frame a digit key transitioned from up to down
   * (edge-triggered, ignores OS key-repeat).
   */
  public isDigitKeyJustPressed(key: DigitKey): boolean {
    return this.frameKeyPresses.has(DIGIT_KEY_CODES[key]);
  }

  /**
   * True only on the frame a debug key transitioned from
   * up to down (edge-triggered, ignores OS key-repeat) — same pattern as
   * isDigitKeyJustPressed, kept separate since debug keys are not part
   * of the InputAction binding table.
   */
  public isDebugKeyJustPressed(key: DebugKey): boolean {
    return this.frameKeyPresses.has(DEBUG_KEY_CODES[key]);
  }

  /**
   * True while either the left or right variant of a modifier key is
   * held down. Not edge-triggered — used for continuous state like
   * "Shift held = move faster", not one-shot toggles.
   */
  public isModifierKeyHeld(key: ModifierKey): boolean {
    for (const code of MODIFIER_KEY_CODES[key]) {
      if (this.keysDown.has(code)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Returns true only on the frame the given KeyboardEvent.code was just
   * pressed (edge-triggered, ignores OS key-repeat).
   */
  public isKeyJustPressed(code:string):boolean{return this.frameKeyPresses.has(code);}
  public isActionJustPressed(action:InputAction):boolean{return this.bindings[action].some(code=>this.frameKeyPresses.has(code));}

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
