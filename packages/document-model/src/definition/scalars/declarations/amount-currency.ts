import { defineScalar } from "../define-scalar.js";
import { stringAmountCoercion, stringAmountValidator } from "./amounts.js";

export const amountCurrencyScalar = defineScalar({
  name: "Amount_Currency",
  builderName: "AmountCurrency",
  description: "A currency amount carrying a string value and a string unit.",
  representation: "json-object",
  validator: stringAmountValidator,
  zodSource: "z.object({ unit: z.string(), value: z.string()})",
  typescriptType: "{ unit: string, value: string }",
  coercion: stringAmountCoercion,
  zero: {
    kind: "none",
    reason: "a currency amount has no meaningful empty value or unit",
  },
});
