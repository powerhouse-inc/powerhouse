import { z } from "zod";
import type { Command } from "../core/types.js";
import { getSchemaFields } from "../core/schema.js";
import type { FieldInfo } from "../core/schema.js";

/**
 * Tokenize input respecting quotes, and report whether the cursor is inside
 * an open quote (meaning we should not offer completions).
 */
function tokenizeInput(input: string): {
  tokens: string[];
  inQuote: boolean;
  trailingSpace: boolean;
} {
  const tokens: string[] = [];
  let current = "";
  let inQuote = false;
  let quoteChar = "";

  for (const ch of input) {
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

  const trailingSpace =
    !inQuote &&
    input.length > 0 &&
    (input[input.length - 1] === " " || input[input.length - 1] === "\t");
  return { tokens, inQuote, trailingSpace };
}

/**
 * Collect flag names already present in the tokens.
 */
function usedFlags(tokens: string[]): Set<string> {
  const used = new Set<string>();
  for (const t of tokens) {
    if (t.startsWith("--")) used.add(t);
  }
  return used;
}

/**
 * Get auto-completion suggestions for partial REPL input.
 *
 * Supports:
 * - Command name completion: `/gr` → ['/greet']
 * - Flag name completion: `/add --` → ['--title', '--priority', '--due']
 * - Flag name after trailing space: `/add ` → ['--title', '--priority', '--due']
 * - Enum value completion: `/list --filter d` → ['done']
 * - No completions inside quoted strings
 */
export function getCompletions(input: string, commands: Command[]): string[] {
  const trimmed = input.trimStart();
  if (!trimmed.startsWith("/")) return [];

  const { tokens, inQuote, trailingSpace } = tokenizeInput(trimmed);
  if (tokens.length === 0) return [];

  // Don't complete inside quoted strings
  if (inQuote) return [];

  // Completing the command name: `/gr` → ['/greet']
  if (tokens.length === 1 && !trailingSpace) {
    const prefix = tokens[0]!.slice(1).toLowerCase();
    const builtins = ["exit", "quit"];
    const allNames = [...commands.map((c) => c.id), ...builtins];
    return allNames
      .filter((name) => name.toLowerCase().startsWith(prefix))
      .map((name) => `/${name}`);
  }

  // Find the command
  const cmdName = tokens[0]!.slice(1).toLowerCase();
  const cmd = commands.find((c) => c.id === cmdName);
  if (!cmd) return [];

  const fields = getSchemaFields(cmd.inputSchema);
  const used = usedFlags(tokens);

  // Trailing space after input — suggest next possible flags or values
  if (trailingSpace) {
    const lastToken = tokens[tokens.length - 1]!;
    // If the last token is a non-boolean flag, suggest its values
    if (lastToken.startsWith("--")) {
      const fieldName = lastToken.slice(2);
      const field = fields.find((f) => f.key === fieldName);
      if (field && field.baseType !== "boolean") {
        return getFieldValueCompletions(cmd, fieldName, "");
      }
    }
    // Suggest unused flags
    return fields
      .filter((f) => !used.has(`--${f.key}`))
      .map((f) => `--${f.key}`);
  }

  const lastToken = tokens[tokens.length - 1]!;
  const prevToken = tokens.length >= 2 ? tokens[tokens.length - 2]! : "";

  // If previous token is a non-boolean flag, complete the value
  if (prevToken.startsWith("--")) {
    const fieldName = prevToken.slice(2);
    const field = fields.find((f) => f.key === fieldName);
    if (field && field.baseType !== "boolean") {
      return getFieldValueCompletions(cmd, fieldName, lastToken);
    }
  }

  // If the current token starts with - or --, complete the flag name
  if (lastToken.startsWith("-")) {
    const prefix = lastToken.startsWith("--")
      ? lastToken.slice(2).toLowerCase()
      : "";
    return fields
      .filter(
        (f) =>
          f.key.toLowerCase().startsWith(prefix) && !used.has(`--${f.key}`),
      )
      .map((f) => `--${f.key}`);
  }

  return [];
}

/**
 * Get value completions for an enum field.
 */
function getFieldValueCompletions(
  cmd: Command,
  fieldName: string,
  partial: string,
): string[] {
  const enumValues = getEnumValues(cmd.inputSchema, fieldName);
  if (!enumValues) return [];

  const prefix = partial.toLowerCase();
  return enumValues.filter((v) => v.toLowerCase().startsWith(prefix));
}

/**
 * Get the suffix to append after a flag completion.
 * Returns ` "` for non-boolean, non-enum fields (opening a value quote),
 * empty string otherwise.
 */
export function getCompletionSuffix(
  completion: string,
  input: string,
  commands: Command[],
): string {
  if (!completion.startsWith("--")) return "";

  const trimmed = input.trimStart();
  const { tokens } = tokenizeInput(trimmed);
  const cmdName = tokens[0]?.slice(1).toLowerCase();
  const cmd = commands.find((c) => c.id === cmdName);
  if (!cmd) return "";

  const fieldName = completion.slice(2);
  const fields = getSchemaFields(cmd.inputSchema);
  const field = fields.find((f) => f.key === fieldName);
  if (!field || field.baseType === "boolean") return "";

  // Enum fields don't need quotes
  const enumValues = getEnumValues(cmd.inputSchema, fieldName);
  if (enumValues) return " ";

  return ' "';
}

/**
 * Get the ghost suggestion for the current input — the full input string
 * with the first completion applied, suitable for inline preview.
 *
 * Returns null if no suggestion is available.
 */
export function getGhostSuggestion(
  input: string,
  commands: Command[],
): string | null {
  // Inside an open quote — suggest closing it
  const trimmed = input.trimStart();
  const { inQuote } = tokenizeInput(trimmed);
  if (inQuote) return input + '"';

  const completions = getCompletions(input, commands);
  if (completions.length === 0) return null;

  const applied = applyCompletion(input, completions[0]!);
  const suffix = getCompletionSuffix(completions[0]!, input, commands);

  return applied + suffix;
}

/**
 * Apply a completion candidate to the current input by replacing the last token.
 * If the input ends with a trailing space, the completion is appended.
 *
 * For command completions (`/gr` + `/greet` → `/greet`), replaces the only token.
 * For flag completions (`/greet --na` + `--name` → `/greet --name`), replaces the last token.
 * For value completions (`/list --filter d` + `done` → `/list --filter done`), replaces the last token.
 * For trailing space (`/add ` + `--title` → `/add --title`), appends.
 */
export function applyCompletion(input: string, completion: string): string {
  const trailingSpace =
    input.length > 0 &&
    (input[input.length - 1] === " " || input[input.length - 1] === "\t");
  if (trailingSpace) return input + completion;
  const lastSpaceIdx = input.lastIndexOf(" ");
  if (lastSpaceIdx === -1) return completion;
  return input.slice(0, lastSpaceIdx + 1) + completion;
}

/**
 * Extract enum values from a Zod schema field, if it's an enum type.
 * Unwraps Default/Optional/Nullable wrappers to find the underlying ZodEnum.
 */
function getEnumValues(schema: z.ZodType, fieldName: string): string[] | null {
  if (!(schema instanceof z.ZodObject)) return null;

  let field = (schema.shape as Record<string, z.ZodType>)[fieldName];
  if (!field) return null;

  // Unwrap Default/Optional/Nullable wrappers using public Zod v4 API
  const wrapperTypes = new Set(["default", "optional", "nullable"]);
  let current = field as { type: string; def: { innerType?: unknown } };
  while (wrapperTypes.has(current.type) && current.def.innerType) {
    current = current.def.innerType as typeof current;
    field = current as unknown as z.ZodType;
  }

  // Check if it's a ZodEnum
  if (field instanceof z.ZodEnum) {
    return field.options as string[];
  }

  return null;
}
