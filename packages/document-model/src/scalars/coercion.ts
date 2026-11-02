import type { z } from "zod";
import type { ScalarLiteralNode } from "./scalar-literal.js";
import type { ScalarCoercion } from "./types.js";

/** Runs `schema` on every path; `readLiteral` turns an inline literal into its value first. */
export function validatingCoercion<TValue>(
  schema: z.ZodType<TValue>,
  readLiteral: (node: ScalarLiteralNode) => unknown,
): ScalarCoercion<TValue> {
  const parse = (value: unknown): TValue => schema.parse(value);
  return {
    parseValue: parse,
    parseLiteral: (node) => parse(readLiteral(node)),
    serialize: parse,
  };
}
