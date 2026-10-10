import { z } from "zod";
import { validatingCoercion } from "../coercion.js";
import {
  floatOnlyNumber,
  literalString,
  objectFields,
} from "../scalar-literal.js";

export type AmountWithStringValue = {
  readonly unit: string;
  readonly value: string;
};

export const stringAmountValidator: z.ZodType<
  AmountWithStringValue,
  AmountWithStringValue
> = z.object({ unit: z.string(), value: z.string() });

export const stringAmountCoercion = validatingCoercion(
  stringAmountValidator,
  (node) => {
    const fields = objectFields(node);
    const value = literalString(fields.get("value"), "value");
    if (!/^\d+(\.\d+)?$/.test(value)) {
      throw new TypeError("value must be a numeric string.");
    }
    return { unit: literalString(fields.get("unit"), "unit"), value };
  },
);

const numberValidator = z.number();

export const numberAmountFields = {
  representation: "number",
  validator: numberValidator,
  zodSource: "z.number()",
  coercion: validatingCoercion(numberValidator, (node) =>
    floatOnlyNumber(node, "value"),
  ),
  zero: { kind: "value", value: 0 },
} as const;
