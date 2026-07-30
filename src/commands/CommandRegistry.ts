/**
 * Command definition and registry architecture.
 */

export interface CommandContext {
  readonly args: string[];
  readonly raw: string;
}

export interface CommandResult {
  readonly success: boolean;
  readonly message?: string;
}

export interface CommandDefinition {
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly usage: string;
  readonly description: string;
  readonly execute: (ctx: CommandContext) => CommandResult | string | undefined;
  readonly suggest?: (args: string[], partial: string) => readonly string[];
}

export class CommandRegistry {
  private readonly commands = new Map<string, CommandDefinition>();

  public register(cmd: CommandDefinition): void {
    const names = [cmd.name, ...(cmd.aliases ?? [])];
    for (const name of names) {
      const key = name.toLowerCase();
      if (this.commands.has(key)) {
        throw new Error(`Command '${name}' already registered`);
      }
      this.commands.set(key, cmd);
    }
  }

  public get(name: string): CommandDefinition | undefined {
    return this.commands.get(name.toLowerCase());
  }

  public listNames(): readonly string[] {
    const names = new Set<string>();
    for (const cmd of this.commands.values()) {
      names.add(cmd.name);
    }
    return Array.from(names).sort();
  }

  public has(name: string): boolean {
    return this.commands.has(name.toLowerCase());
  }

  public suggest(name: string, args: string[]): readonly string[] {
    const cmd = this.get(name);
    if (!cmd || !cmd.suggest) return [];
    const partial = args.length > 0 ? args[args.length - 1] ?? '' : '';
    return cmd.suggest(args.slice(0, -1), partial);
  }
}
