/**
 * Simple command execution service that connects chat input, command registry,
 * and chat feedback display.
 */

import type { ChatDisplay } from '../chat/ChatDisplay';
import { CommandRegistry } from './CommandRegistry';
import { parseCommand } from './CommandParser';
import { registerDefaultCommands } from './commands/DefaultCommands';
import { CheatsState } from './CheatsState';

export class CommandService {
  private readonly registry = new CommandRegistry();
  public readonly cheats = new CheatsState();

  public constructor(private readonly chatDisplay?: ChatDisplay) {
    registerDefaultCommands(this.registry, this.cheats);
  }

  public handleMessage(text: string): void {
    if (!text.startsWith('/')) {
      // Not a command; treat as chat message
      if (this.chatDisplay) {
        this.chatDisplay.addMessage(text);
      }
      return;
    }

    const parsed = parseCommand(text);
    if (!parsed) {
      if (this.chatDisplay) this.chatDisplay.addMessage('Unknown command');
      return;
    }

    const cmd = this.registry.get(parsed.name);
    if (!cmd) {
      if (this.chatDisplay) this.chatDisplay.addMessage(`Unknown command: /${parsed.name}`);
      return;
    }

    const result = cmd.execute({ args: parsed.args, raw: text });
    if (typeof result === 'string') {
      if (this.chatDisplay) this.chatDisplay.addMessage(result);
    } else if (result) {
      const msg = result.message ?? (result.success ? `Executed /${parsed.name}` : `Failed /${parsed.name}`);
      if (this.chatDisplay) this.chatDisplay.addMessage(msg);
    }
  }

  public getRegistry(): CommandRegistry {
    return this.registry;
  }
}
