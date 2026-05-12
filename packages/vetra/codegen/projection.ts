/**
 * Output projection + encoding for the spec API.
 *
 * `path` is a JSONPath expression (RFC 9535). Default: undefined → return the
 * whole value. We use `jsonpath-plus` for the projection.
 *
 * `format` is the wire encoding:
 *  - `"json"` (default) — `JSON.stringify(value, null, 2)`
 *  - `"toon"` — TOON encoding via `@toon-format/toon`. Compact, schema-aware,
 *    aimed at LLM context budgets. See https://toonformat.dev.
 *
 * Both knobs are layered: project first, then encode. A single value (after
 * projection) is wrapped in a `{ value }` envelope so the encoder always sees
 * an object and TOON's tabular output kicks in correctly.
 */
import { encode as encodeToon } from "@toon-format/toon";
import { JSONPath } from "jsonpath-plus";

export type OutputFormat = "json" | "toon";

export type ProjectionOptions = {
  path?: string;
  format?: OutputFormat;
};

/** Apply a JSONPath expression. Throws with a clear message on a malformed
 *  path. Returns the matched value(s):
 *  - if the path resolves to a single match, that match unwrapped
 *  - if it resolves to multiple, an array (preserves JSONPath semantics) */
export function applyJsonPath<T = unknown>(value: unknown, path: string): T {
  let results: unknown[];
  try {
    results = JSONPath({ path, json: value as object, resultType: "value" });
  } catch (err) {
    throw new Error(
      `Invalid JSONPath "${path}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (results.length === 0) return undefined as T;
  if (results.length === 1) return results[0] as T;
  return results as T;
}

/** Encode a value as a string in the requested format. */
export function encodeValue(value: unknown, format: OutputFormat): string {
  if (format === "toon") {
    // TOON expects an object/array at the top level; wrap scalars so the
    // encoder doesn't reject them.
    const payload =
      value !== null && (typeof value === "object" || Array.isArray(value))
        ? value
        : { value };
    return encodeToon(payload as never);
  }
  return JSON.stringify(value, null, 2);
}

/** Convenience: project (if path provided) then encode. */
export function projectAndEncode(
  value: unknown,
  opts: ProjectionOptions = {},
): { value: unknown; encoded: string; format: OutputFormat } {
  const projected = opts.path ? applyJsonPath(value, opts.path) : value;
  const format = opts.format ?? "json";
  return { value: projected, encoded: encodeValue(projected, format), format };
}
