import type { z } from "zod";
import type { DocumentRegistry } from "../integrations/powerhouse/types.js";
import { getSchemaFields } from "./schema.js";
import type { Command } from "./types.js";

/**
 * Define a command — the atomic unit of ph-clint.
 * Compatible with Mastra createTool() shape.
 */
export function defineCommand<
  TInput extends z.ZodType,
  TOutput = unknown,
  TConfig = Record<string, unknown>,
  R extends DocumentRegistry = any,
>(
  options: Command<TInput, TOutput, TConfig, R>,
): Command<TInput, TOutput, TConfig, R> {
  if (options.positional && options.positional.length > 0) {
    const fields = getSchemaFields(options.inputSchema);
    const fieldMap = new Map(fields.map((f) => [f.key, f]));
    const seen = new Set<string>();
    let sawOptional = false;
    for (const key of options.positional) {
      const field = fieldMap.get(key);
      if (!field) {
        throw new Error(
          `Command '${options.id}': positional field '${key}' is not in inputSchema`,
        );
      }
      if (seen.has(key)) {
        throw new Error(
          `Command '${options.id}': positional field '${key}' listed more than once`,
        );
      }
      seen.add(key);
      const isOptional = field.isOptional || field.hasDefault;
      if (sawOptional && !isOptional) {
        throw new Error(
          `Command '${options.id}': required positional '${key}' may not follow an optional positional`,
        );
      }
      if (isOptional) sawOptional = true;
    }
  }
  return options;
}
