import type { z } from "zod";

/**
 * Output tokens (typed-host-configs T3) replaced the sibling-host reference
 * forms the clint runners used to resolve themselves. A removed key is not
 * just "unrecognized": its error names the token form that replaces it.
 * Pass the result as a strict object's `error` option.
 */
export function removedKeyError(
  key: string,
  hint: (input: Record<string, unknown>) => string,
): z.core.$ZodErrorMap {
  return (issue) => {
    if (issue.code !== "unrecognized_keys" || !issue.keys.includes(key)) {
      return undefined;
    }
    const input =
      typeof issue.input === "object" && issue.input !== null
        ? (issue.input as Record<string, unknown>)
        : {};
    return `\`${key}\` was removed; ${hint(input)}`;
  };
}

/** A quoted host name from a removed reference, or a placeholder. */
export function quotedHost(value: unknown, placeholder: string): string {
  return typeof value === "string" && value.length > 0
    ? JSON.stringify(value)
    : placeholder;
}
