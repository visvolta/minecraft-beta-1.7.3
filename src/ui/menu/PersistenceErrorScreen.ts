import { applyDirtBackground, guiWidth, GuiButton, Screen } from './MenuWidgets';

/**
 * Persistence error/diagnostic screen (Stage 3). Used for fail-loud corruption
 * AND for Save-and-Quit failure/timeout. The caller configures the title,
 * summary, copyable diagnostic block and the safe actions appropriate to the
 * situation:
 *   - failed save: Retry Save-and-Quit / Return to World / Copy Diagnostics
 *   - timed out (operation unsettled): Continue Waiting / Reload (unknown result) / Copy Diagnostics
 *   - corruption at load: Return to World List / Reload / Copy Diagnostics
 * There are deliberately NO repair / delete / regenerate / continue-anyway /
 * navigate-to-title-as-if-saved actions.
 */
export interface PersistenceErrorAction {
  label: string;
  onClick: () => void;
}

export class PersistenceErrorScreen extends Screen {
  private readonly buttons: GuiButton[] = [];
  private readonly diagnostic: string;

  public constructor(title: string, summary: string, diagnosticBlock: string, actions: PersistenceErrorAction[]) {
    super();
    applyDirtBackground(this.root);
    this.diagnostic = diagnosticBlock;

    const titleEl = document.createElement('div');
    titleEl.textContent = title;
    titleEl.style.cssText = 'position:absolute;left:0;right:0;top:26px;text-align:center;font:18px Minecraft;color:white';

    const summaryEl = document.createElement('div');
    summaryEl.textContent = summary;
    summaryEl.style.cssText = 'position:absolute;left:8%;right:8%;top:56px;text-align:center;font:12px Minecraft;color:#ffd0d0';

    const box = document.createElement('textarea');
    box.value = diagnosticBlock;
    box.readOnly = true;
    box.spellcheck = false;
    box.style.cssText = 'position:absolute;left:8%;right:8%;top:96px;height:170px;background:#000;color:#ff9090;font:12px Minecraft;border:1px solid #555;padding:6px;resize:none';

    this.root.append(titleEl, summaryEl, box);

    const copyBtn = new GuiButton('Copy Diagnostics', () => void this.copyDiagnostics(copyBtn), 150, 20);
    this.buttons.push(copyBtn);
    for (const action of actions) {
      this.buttons.push(new GuiButton(action.label, action.onClick, 150, 20));
    }
    for (const button of this.buttons) this.root.append(button.element);
    this.layout();
  }

  private async copyDiagnostics(button: GuiButton): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.diagnostic);
      button.element.textContent = 'Copied!';
    } catch {
      button.element.textContent = 'Select & copy above';
    }
  }

  protected override onResize(): void {
    this.layout();
  }

  private layout(): void {
    const w = guiWidth();
    const y = 282;
    const gap = 8;
    const total = this.buttons.length;
    const buttonWidth = 150;
    const rowWidth = total * buttonWidth + (total - 1) * gap;
    let x = w / 2 - rowWidth / 2;
    for (const button of this.buttons) {
      button.setPosition(x, y);
      x += buttonWidth + gap;
    }
  }
}
