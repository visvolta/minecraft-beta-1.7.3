import { BUTTON_HEIGHT, BUTTON_WIDTH, FONT_SIZE_PX } from '../ui/BetaGuiMetrics';

/**
 * Beta `GuiGameOver`.
 *
 * Layout transcribed from source:
 *   drawGradientRect(0, 0, width, height, 1615855616, -1602211792)  // red wash
 *   drawCenteredString("Game over!",  width/2, height/4 - 40 ... )
 *   GuiButton(1, width/2 - 100, height/4 + 72, "Respawn")
 *   GuiButton(2, width/2 - 100, height/4 + 96, "Title menu")
 *
 * Buttons use the standard 200×20 Beta size. The screen owns input while open:
 * pointer lock is released and gameplay keys never reach the world behind it.
 *
 * Beta also draws the player's score; this project keeps no score, so nothing
 * is displayed rather than inventing a value.
 */

type ButtonState = 'normal' | 'highlighted' | 'clicked' | 'disabled';

export interface DeathScreenActions {
  readonly respawn: () => void;
  readonly titleScreen: () => void;
}

export class DeathScreen {
  private readonly root = typeof document !== 'undefined' ? document.createElement('div') : ({} as HTMLDivElement);
  private readonly title = typeof document !== 'undefined' ? document.createElement('div') : ({} as HTMLDivElement);
  private readonly respawnButton = typeof document !== 'undefined' ? document.createElement('button') : ({} as HTMLButtonElement);
  private readonly titleButton = typeof document !== 'undefined' ? document.createElement('button') : ({} as HTMLButtonElement);
  private readonly actions: DeathScreenActions;
  private openState = false;

  /**
   * Accepts either the Beta action pair or a bare respawn callback, so
   * existing callers that only supply respawn keep working.
   */
  public constructor(actions: DeathScreenActions | (() => void)) {
    this.actions = typeof actions === 'function'
      ? { respawn: actions, titleScreen: () => undefined }
      : actions;

    if (typeof document === 'undefined') return;

    // Beta's red gradient wash over the still-rendered world.
    this.root.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:500', 'display:none',
      'align-items:center', 'justify-content:flex-start', 'flex-direction:column',
      'background:linear-gradient(rgba(96,0,0,.38),rgba(48,0,0,.62))',
      'font-family:Minecraft', 'color:white', 'text-shadow:2px 2px #300',
      'image-rendering:pixelated',
    ].join(';');

    this.title.textContent = 'Game over!';
    this.title.style.cssText = 'font-size:24px;font-weight:bold;margin-top:18%;margin-bottom:28px';

    this.configureButton(this.respawnButton, 'Respawn', () => this.actions.respawn());
    this.configureButton(this.titleButton, 'Title menu', () => this.actions.titleScreen());

    this.root.append(this.title, this.respawnButton, this.titleButton);
    document.body.append(this.root);
    window.addEventListener('keydown', this.onKeyDown, true);
  }

  private configureButton(button: HTMLButtonElement, label: string, onClick: () => void): void {
    button.textContent = label;
    button.style.cssText = [
      `width:${BUTTON_WIDTH}px`, `height:${BUTTON_HEIGHT}px`,
      'border:0', 'padding:0', 'margin-bottom:4px', 'color:white',
      `font:${FONT_SIZE_PX}px Minecraft`,
      'display:flex', 'align-items:center', 'justify-content:center',
      'text-shadow:1px 1px #3f3f3f',
      "background:url('/textures/gui/button_normal.png') 0 0 / 100% 100%",
      'image-rendering:pixelated', 'cursor:pointer',
    ].join(';');
    button.addEventListener('mouseenter', () => this.setState(button, 'highlighted'));
    button.addEventListener('mouseleave', () => this.setState(button, 'normal'));
    button.addEventListener('mousedown', () => this.setState(button, 'clicked'));
    button.addEventListener('mouseup', () => this.setState(button, 'highlighted'));
    button.addEventListener('click', (event) => {
      event.preventDefault();
      window.dispatchEvent(new CustomEvent('mc-ui-click'));
      onClick();
    });
  }

  private setState(button: HTMLButtonElement, state: ButtonState): void {
    button.style.backgroundImage = `url('/textures/gui/button_${state}.png')`;
  }

  /**
   * Swallows gameplay keys while the screen is open so nothing reaches the
   * world behind it; Enter/Space still activate Respawn as Beta allows.
   */
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.openState) return;
    if (event.code === 'Enter' || event.code === 'Space') {
      event.preventDefault();
      event.stopPropagation();
      this.respawnButton.click();
      return;
    }
    // Block everything else from reaching gameplay handlers.
    event.stopPropagation();
  };

  public open(): void {
    if (this.openState) return;
    this.openState = true;
    if (typeof document === 'undefined') return;
    this.root.style.display = 'flex';
    if (document.pointerLockElement) document.exitPointerLock();
  }

  public close(): void {
    this.openState = false;
    if (typeof document === 'undefined') return;
    this.root.style.display = 'none';
    this.setState(this.respawnButton, 'normal');
    this.setState(this.titleButton, 'normal');
  }

  public get isOpen(): boolean {
    return this.openState;
  }

  public activateRespawn(): void {
    if (this.openState) this.actions.respawn();
  }

  public dispose(): void {
    if (typeof window !== 'undefined') window.removeEventListener('keydown', this.onKeyDown, true);
    this.root.remove?.();
  }
}
