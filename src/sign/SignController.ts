import type { SignUi } from './SignUi';
import type { SignManager, SignContainer } from './SignManager';

export class SignController {
  public isOpen = false;
  private activeContainer: SignContainer | null = null;

  public constructor(
    private readonly ui: SignUi,
    private readonly signManager: SignManager
  ) {
    this.ui.setOnConfirm((lines) => {
      if (this.activeContainer) {
        this.activeContainer.lines = lines;
        this.activeContainer.needsTextureUpdate = true;
      }
      this.close();
    });

    this.ui.setOnCancel(() => {
      this.close();
    });
  }

  public open(x: number, y: number, z: number): void {
    if (this.isOpen) return;
    this.isOpen = true;
    
    this.activeContainer = this.signManager.getOrCreate(x, y, z);
    
    if (typeof document !== 'undefined' && document.pointerLockElement !== null) {
      document.exitPointerLock?.();
    }

    this.ui.show(this.activeContainer.lines);
  }

  public close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.activeContainer = null;
    this.ui.hide();
  }

  public dispose(): void {
    this.close();
    this.ui.dispose();
  }
}
