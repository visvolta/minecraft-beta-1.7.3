/**
 * Simple Beta-style chat history overlay.
 * Supports command feedback, system messages, and future multiplayer plumbing.
 */

export interface ChatMessage {
  readonly text: string;
  readonly timestamp: number;
}

export class ChatDisplay {
  private readonly root: HTMLElement;
  private messages: ChatMessage[] = [];
  private readonly maxVisible = 8;
  private readonly fadeMs = 10000;

  public constructor() {
    this.root = document.createElement('div');
    this.root.style.cssText = `
      position: fixed;
      bottom: 12px;
      left: 12px;
      color: white;
      font-family: 'Minecraft';
      font-size: 14px;
      text-shadow: 1px 1px 1px rgba(0,0,0,0.8);
      pointer-events: none;
      z-index: 200;
      max-width: 420px;
      line-height: 1.3em;
      background: rgba(0,0,0,0.35);
      padding: 6px 8px;
      border-radius: 2px;
      display: block;
    `;
    document.body.appendChild(this.root);
  }

  public addMessage(text: string): void {
    this.messages.push({ text, timestamp: Date.now() });
    this.render();
  }

  public clear(): void {
    this.messages.length = 0;
    this.render();
  }

  public setVisible(visible: boolean): void {
    this.root.style.display = visible ? 'block' : 'none';
  }

  public isVisible(): boolean {
    return this.root.style.display !== 'none';
  }

  /**
   * Re-renders so messages fade out on time. Cheap: it only rebuilds when the
   * visible set actually changes, so the idle HUD does no DOM work.
   */
  public update(): void {
    const now = Date.now();
    const visible = this.messages.filter(
      (m) => now - m.timestamp < this.fadeMs || this.messages.length <= this.maxVisible,
    ).length;
    if (visible === this.lastVisibleCount) return;
    this.lastVisibleCount = visible;
    this.render();
  }

  private lastVisibleCount = -1;

  private render(): void {
    const now = Date.now();
    const visibleMessages = this.messages.filter(
      (m) => now - m.timestamp < this.fadeMs || this.messages.length <= this.maxVisible,
    );
    // Keep only the most recent messages within maxVisible
    const trimmed = visibleMessages.slice(-this.maxVisible);
    this.root.innerHTML = trimmed.map((m) => `<div>${this.escapeHtml(m.text)}</div>`).join('');
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  public dispose(): void {
    this.root.remove();
  }
}
