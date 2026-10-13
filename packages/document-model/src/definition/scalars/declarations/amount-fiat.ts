import { z } from "zod";
import { validatingCoercion } from "../coercion.js";
import { defineScalar } from "../define-scalar.js";
import {
  floatOnlyNumber,
  literalString,
  objectFields,
} from "../scalar-literal.js";

export type AmountWithNumberValue = {
  readonly unit: string;
  readonly value: number;
};

const numberAmountValidator: z.ZodType<
  AmountWithNumberValue,
  AmountWithNumberValue
> = z.object({
  unit: z.string(),
  value: z.number(),
});

export const amountFiatScalar = defineScalar({
  name: "Amount_Fiat",
  builderName: "AmountFiat",
  description: "A fiat amount carrying a numeric value and string unit.",
  representation: "json-object",
  validator: numberAmountValidator,
  zodSource: "z.object({ unit: z.string(), value: z.number() })",
  typescriptType: "{ unit: string, value: number }",
  coercion: validatingCoercion(numberAmountValidator, (node) => {
    const fields = objectFields(node);
    return {
      unit: literalString(fields.get("unit"), "unit"),
      value: floatOnlyNumber(fields.get("value"), "value"),
    };
  }),
  zero: { kind: "none", reason: "a fiat amount requires an explicit unit" },
});
