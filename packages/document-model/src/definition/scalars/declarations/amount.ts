import { z } from "zod";
import { validatingCoercion } from "../coercion.js";
import { defineScalar } from "../define-scalar.js";
import {
  floatOnlyNumber,
  literalString,
  objectFields,
} from "../scalar-literal.js";

export type Amount = { readonly unit?: string; readonly value?: number };

const amountValidator: z.ZodType<Amount, Amount> = z.object({
  unit: z.string().optional(),
  value: z.number(),
});

export const amountScalar = defineScalar({
  name: "Amount",
  description:
    "An amount with a required numeric value and optional string unit.",
  representation: "json-object",
  validator: amountValidator,
  zodSource: "z.object({ unit: z.string().optional(), value: z.number() })",
  typescriptType: "{ unit?: string, value?: number }",
  coercion: validatingCoercion(amountValidator, (node) => {
    const fields = objectFields(node);
    const unit = fields.get("unit");
    return {
      unit: unit === undefined ? undefined : literalString(unit, "unit"),
      value: floatOnlyNumber(fields.get("value"), "value"),
    };
  }),
  zero: {
    kind: "none",
    reason: "an amount requires an explicit finite value",
  },
});
