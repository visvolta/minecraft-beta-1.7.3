import type { Engine } from '../engine/Engine';
import type { PersistenceRiskSnapshot } from '../persistence2/PersistenceRisk';

/**
 * Manages the browser beforeunload "unsaved changes" warning, derived entirely
 * from the active session's aggregated persistence-risk snapshot (correction 8).
 * It SUBSCRIBES to the engine's risk events rather than polling unrelated fields.
 *
 * The warning is installed while the world has any reason to lose data (dirty or
 * in-flight chunks, changed/in-flight metadata, accepted unloads, an active
 * final-save attempt, or an unresolved failure) and removed once fully clean.
 *
 * It NEVER initiates a save/barrier/close/IDB transaction from beforeunload,
 * pagehide or unload (page unload cannot reliably persist); autosave is the
 * crash-loss mitigation and controlled Save-and-Quit is the only guaranteed
 * shutdown path. Registration is added/removed without duplicate listeners.
 */
export class DirtyWarningController {
  private unsubscribe: (() => void) | null = null;
  private warningInstalled = false;
  private readonly beforeunload = (event: BeforeUnloadEvent): void => {
    event.preventDefault();
    event.returnValue = '';
  };

  /** Attach to an active engine session; replaces any previous attachment. */
  public attach(engine: Engine): void {
    this.detach();
    this.unsubscribe = engine.subscribePersistenceRisk((snapshot) => this.update(snapshot));
    this.update(engine.getPersistenceRiskSnapshot());
  }

  /** Detach and remove the warning (e.g. when the world session ends). */
  public detach(): void {
    if (this.unsubscribe !== null) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.removeWarning();
  }

  public get isWarningInstalled(): boolean {
    return this.warningInstalled;
  }

  private update(snapshot: PersistenceRiskSnapshot): void {
    if (snapshot.atRisk) this.installWarning();
    else this.removeWarning();
  }

  private installWarning(): void {
    if (this.warningInstalled) return; // no duplicate listeners
    window.addEventListener('beforeunload', this.beforeunload);
    this.warningInstalled = true;
  }

  private removeWarning(): void {
    if (!this.warningInstalled) return;
    window.removeEventListener('beforeunload', this.beforeunload);
    this.warningInstalled = false;
  }
}
