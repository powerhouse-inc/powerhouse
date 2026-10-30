import type { z } from "zod";
import { validatingCoercion } from "../coercion.js";
import {
  floatOnlyNumber,
  literalString,
  objectFields,
} from "../scalar-literal.js";

// The document-engineering scalar resolvers this catalog replaced parsed an
// amount's number only from a float literal, so an integer literal such as 5
// is refused even though the schema accepts 5. The host does not use this
// coercion yet; it accepts 5.
export function floatAmountCoercion(schema: z.ZodType<number>) {
  return validatingCoercion(schema, (node) => floatOnlyNumber(node, "value"));
}

export function stringAmountCoercion<TValue>(schema: z.ZodType<TValue>) {
  return validatingCoercion(schema, (node) => {
    const fields = objectFields(node);
    const value = literalString(fields.get("value"), "value");
    if (!/^\d+(\.\d+)?$/.test(value)) {
      throw new TypeError("value must be a numeric string.");
    }
    return { unit: literalString(fields.get("unit"), "unit"), value };
  });
}
