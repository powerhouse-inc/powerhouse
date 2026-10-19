/**
 * Parse REPL input into a structured command representation.
 * Pure function — no side effects.
 */

export interface ParsedReplInput {
  type: "command" | "exit" | "empty" | "unknown" | "text";
  commandId?: string;
  args?: string[];
  raw: string;
}

/**
 * Parse a REPL input line.
 *
 * - Empty/whitespace → { type: 'empty' }
 * - /exit or /quit → { type: 'exit' }
 * - /cmd --arg val → { type: 'command', commandId: 'cmd', args: ['--arg', 'val'] }
 * - Anything else → { type: 'unknown' }
 */
export function parseReplInput(
  input: string,
  commandIds: string[],
  hasDefaultCommand?: boolean,
): ParsedReplInput {
  const trimmed = input.trim();
  if (!trimmed) {
    return { type: "empty", raw: trimmed };
  }

  if (!trimmed.startsWith("/")) {
    if (hasDefaultCommand) {
      return { type: "text", raw: trimmed };
    }
    return { type: "unknown", raw: trimmed };
  }

  const match = trimmed.match(/^\/(\S+)\s*(.*)/);
  if (!match) {
    return { type: "unknown", raw: trimmed };
  }

  const [, name, rest] = match;
  const cmdName = name!.toLowerCase();

  if (cmdName === "exit" || cmdName === "quit") {
    return { type: "exit", raw: trimmed };
  }

  if (commandIds.includes(cmdName)) {
    const args = tokenizeArgs(rest!);
    return { type: "command", commandId: cmdName, args, raw: trimmed };
  }

  return { type: "unknown", commandId: cmdName, raw: trimmed };
}

/**
 * Tokenize an argument string, respecting quoted values.
 *
 * Examples:
 *   `--name Alice`         → ['--name', 'Alice']
 *   `--title "Hello World"` → ['--title', 'Hello World']
 *   `--title 'Hello World'` → ['--title', 'Hello World']
 */
export function tokenizeArgs(argsStr: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuote = false;
  let quoteChar = "";

  for (const ch of argsStr) {
    if (inQuote) {
      if (ch === quoteChar) {
        inQuote = false;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = true;
      quoteChar = ch;
    } else if (ch === " " || ch === "\t") {
      if (current) {
        tokens.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}
