/**
 * Chat input and command submission system.
 * Handles opening/closing chat, text input, and submitting to command/chat handlers.
 */

import type { Input } from '../input/Input';
import type { CommandRegistry } from '../commands/CommandRegistry';

export interface ChatSubmitHandler {
  (text: string): void;
}

export class ChatSystem {
  private open = false;
  private text = '';
  private readonly inputElement: HTMLInputElement;
  private readonly submitHandlers: ChatSubmitHandler[] = [];
  private registry?: CommandRegistry;
  private readonly history: string[] = [];
  private historyIndex = -1;
  private readonly suggestionOverlay = document.createElement('div');
  private tabCycleIndex = 0;

  public constructor(private readonly input: Input) {
    this.inputElement = document.createElement('input');
    this.inputElement.type = 'text';
    this.inputElement.style.cssText = `
      position: fixed;
      bottom: 12px;
      left: 220px;
      width: 400px;
      padding: 4px 6px;
      font-family: 'Minecraft';
      font-size: 14px;
      background: rgba(0,0,0,0.7);
      color: white;
      border: 1px solid rgba(255,255,255,0.3);
      border-radius: 2px;
      outline: none;
      z-index: 200;
      display: none;
    `;
    document.body.appendChild(this.inputElement);

    this.suggestionOverlay.style.cssText = `
      position: fixed;
      bottom: 40px;
      left: 220px;
      width: 400px;
      color: #aaa;
      font-family: 'Minecraft';
      font-size: 12px;
      pointer-events: none;
      z-index: 199;
      background: rgba(0,0,0,0.6);
      padding: 2px 4px;
      border-radius: 2px;
      display: none;
    `;
    document.body.appendChild(this.suggestionOverlay);

    this.inputElement.addEventListener('input', () => {
      this.tabCycleIndex = 0;
      this.hideSuggestions();
    });

    this.inputElement.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        this.handleTab();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.navigateHistory(-1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.navigateHistory(1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.submit();
      } else if (e.key === 'Escape') {
        // Stop here: without stopPropagation the same Escape also reaches the
        // engine's pause handling and opens the game menu behind the chat.
        e.preventDefault();
        e.stopPropagation();
        this.close();
      }
    });
  }

  public openChat(prefill = ''): void {
    this.open = true;
    this.text = prefill;
    this.inputElement.value = prefill;
    this.inputElement.style.display = 'block';
    this.input.focusChat();
    this.input.setInputMode('chat');
    // Focus synchronously so no keystroke is dropped between opening and
    // focusing. The opening key itself is suppressed by Input (preventDefault
    // + stopPropagation), so it cannot leak into the field.
    this.inputElement.focus();
    const end = this.inputElement.value.length;
    this.inputElement.setSelectionRange(end, end);
  }

  public close(): void {
    if (!this.open) return;
    this.open = false;
    this.text = '';
    this.inputElement.value = '';
    this.inputElement.style.display = 'none';
    this.hideSuggestions();
    this.historyIndex = -1;
    this.input.unfocusChat();
    this.input.setInputMode('gameplay');
  }

  public isOpen(): boolean {
    return this.open;
  }

  public getText(): string {
    return this.text;
  }

  public registerSubmitHandler(handler: ChatSubmitHandler): void {
    this.submitHandlers.push(handler);
  }

  public setRegistry(registry: CommandRegistry): void {
    this.registry = registry;
  }

  public resetCycle(): void {
    this.tabCycleIndex = 0;
  }

  private handleTab(): void {
    const value = this.inputElement.value.trim();
    if (!this.registry) {
      this.hideSuggestions();
      return;
    }
    if (!value.startsWith('/')) {
      this.hideSuggestions();
      return;
    }
    const withoutSlash = value.slice(1);
    const spaceIndex = withoutSlash.indexOf(' ');
    let cmdName = spaceIndex >= 0 ? withoutSlash.slice(0, spaceIndex) : withoutSlash;
    const argsStr = spaceIndex >= 0 ? withoutSlash.slice(spaceIndex + 1) : '';
    const args = argsStr ? argsStr.split(' ') : [];
    const suggestions = this.registry.suggest(cmdName, args);
    if (suggestions.length === 0) {
      this.hideSuggestions();
      this.tabCycleIndex = 0;
    } else if (suggestions.length === 1) {
      const completed = suggestions[0]!;
      if (args.length > 0 && args[args.length - 1] !== undefined) {
        const prevArgs = args.slice(0, -1);
        const newArgs = [...prevArgs, completed];
        this.inputElement.value = '/' + cmdName + ' ' + newArgs.join(' ');
      } else {
        this.inputElement.value = '/' + cmdName + ' ' + completed;
      }
      this.hideSuggestions();
      this.tabCycleIndex = 0;
    } else {
      // Show suggestions and cycle on repeated Tab
      this.tabCycleIndex = (this.tabCycleIndex + 1) % suggestions.length;
      const selected = suggestions[this.tabCycleIndex]!;
      if (args.length > 0 && args[args.length - 1] !== undefined) {
        const prevArgs = args.slice(0, -1);
        const newArgs = [...prevArgs, selected];
        this.inputElement.value = '/' + cmdName + ' ' + newArgs.join(' ');
      } else {
        this.inputElement.value = '/' + cmdName + ' ' + selected;
      }
      this.suggestionOverlay.textContent = suggestions.map((s, i) => (i === this.tabCycleIndex ? `> ${s}` : `  ${s}`)).join('  ');
      this.suggestionOverlay.style.display = 'block';
    }
  }

  private hideSuggestions(): void {
    this.suggestionOverlay.style.display = 'none';
    this.suggestionOverlay.textContent = '';
  }

  private navigateHistory(direction: number): void {
    if (this.history.length === 0) return;
    this.historyIndex = Math.max(-1, Math.min(this.history.length - 1, this.historyIndex + direction));
    if (this.historyIndex >= 0) {
      this.inputElement.value = this.history[this.history.length - 1 - this.historyIndex]!;
    } else {
      this.inputElement.value = '';
    }
  }

  public tick(): void {
    // Check T press (not when input focused) and / press
    if (!this.input.isChatFocused() && !this.input.getInputMode().includes('chat')) {
      if (this.input.isDigitKeyJustPressed('1' as any)) {
        // Placeholder: T key binding handled externally
      }
    }
  }

  private submit(): void {
    const text = this.inputElement.value.trim();
    if (text.length === 0) {
      this.close();
      return;
    }
    // Add to command history
    if (text.startsWith('/')) {
      if (this.history[this.history.length - 1] !== text) {
        this.history.push(text);
        if (this.history.length > 20) this.history.shift();
      }
    }
    this.historyIndex = -1;
    for (const handler of this.submitHandlers) {
      handler(text);
    }
    this.close();
  }

  public dispose(): void {
    this.inputElement.remove();
  }
}
