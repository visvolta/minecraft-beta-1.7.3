import { applyDirtBackground, guiWidth, GuiButton, Screen } from './MenuWidgets';
import type { RecordCorruptionError } from '../../persistence2/codec/PersistenceError';

/**
 * Fail-loud persistence-corruption screen (Stage 2). Shown when a stored record
 * exists but fails validation (header/version/checksum/length/decompression/
 * schema/coordinate). The corrupt record is preserved unchanged — there are
 * deliberately NO repair / delete / regenerate / continue-anyway actions, only
 * safe ones: copy diagnostics, return to the world list, reload the application.
 */
export interface PersistenceErrorActions {
  readonly returnToWorldList: () => void;
}

export class PersistenceErrorScreen extends Screen {
  private readonly diagnostic: string;
  private readonly copyBtn: GuiButton;
  private readonly listBtn: GuiButton;
  private readonly reloadBtn: GuiButton;

  public constructor(error: RecordCorruptionError, actions: PersistenceErrorActions) {
    super();
    applyDirtBackground(this.root);

    const lines = [
      'A stored world record failed validation.',
      'The record has been preserved unchanged (not deleted, overwritten or regenerated).',
      '',
      `Record kind: ${error.kind}`,
      `Validation stage: ${error.stage}`,
      error.worldId !== undefined ? `World: ${error.worldId}` : null,
      error.chunkX !== undefined && error.chunkZ !== undefined ? `Chunk: ${error.chunkX}, ${error.chunkZ}` : null,
      '',
      `Detail: ${error.message}`,
    ].filter((line): line is string => line !== null);
    this.diagnostic = lines.join('\n');

    const title = document.createElement('div');
    title.textContent = 'World Data Corrupted';
    title.style.cssText = 'position:absolute;left:0;right:0;top:30px;text-align:center;font:18px Minecraft, monospace;color:white';

    const subtitle = document.createElement('div');
    subtitle.textContent = 'Loading was stopped to protect your data. Safe actions only.';
    subtitle.style.cssText = 'position:absolute;left:0;right:0;top:58px;text-align:center;font:12px Minecraft, monospace;color:#aaa';

    const box = document.createElement('textarea');
    box.value = this.diagnostic;
    box.readOnly = true;
    box.spellcheck = false;
    box.style.cssText = 'position:absolute;left:10%;right:10%;top:86px;height:170px;background:#000;color:#ff9090;font:12px Minecraft, monospace;border:1px solid #555;padding:6px;resize:none';

    this.copyBtn = new GuiButton('Copy Diagnostics', () => void this.copyDiagnostics(), 150, 20);
    this.listBtn = new GuiButton('World List', actions.returnToWorldList, 150, 20);
    this.reloadBtn = new GuiButton('Reload App', () => window.location.reload(), 150, 20);

    this.root.append(title, subtitle, box, this.copyBtn.element, this.listBtn.element, this.reloadBtn.element);
    this.layout();
  }

  private async copyDiagnostics(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.diagnostic);
      this.copyBtn.element.textContent = 'Copied!';
    } catch {
      // Clipboard unavailable; the diagnostic box is selectable for manual copy.
      this.copyBtn.element.textContent = 'Select & copy above';
    }
  }

  protected override onResize(): void {
    this.layout();
  }

  private layout(): void {
    const w = guiWidth();
    const y = 272;
    this.copyBtn.centerAt(w / 2 - 160, y);
    this.listBtn.centerAt(w / 2, y);
    this.reloadBtn.centerAt(w / 2 + 160, y);
  }
}
