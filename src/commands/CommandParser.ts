/**
 * Simple whitespace-separated command parser.
 * Supports basic numeric validation and quoted arguments.
 */

export interface ParsedCommand {
  readonly name: string;
  readonly args: string[];
}

export function parseCommand(input: string): ParsedCommand | undefined {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return undefined;

  const withoutPrefix = trimmed.slice(1);
  if (withoutPrefix.length === 0) return undefined;

  const parts: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < withoutPrefix.length; i++) {
    const char = withoutPrefix[i];
    if (!inQuotes && (char === '"' || char === "'")) {
      inQuotes = true;
      quoteChar = char;
    } else if (inQuotes && char === quoteChar) {
      inQuotes = false;
      quoteChar = '';
    } else if (!inQuotes && char === ' ') {
      if (current.length > 0) {
        parts.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current.length > 0) parts.push(current);
  if (parts.length === 0) return undefined;

  return { name: parts[0]!, args: parts.slice(1) };
}

export function validateNumeric(arg: string, _label?: string): number | undefined {
  const num = Number(arg);
  if (isNaN(num)) return undefined;
  if (!Number.isInteger(num) && !Number.isFinite(num)) return undefined;
  return num;
}
