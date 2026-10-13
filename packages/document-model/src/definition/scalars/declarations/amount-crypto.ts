import { defineScalar } from "../define-scalar.js";
import { stringAmountCoercion, stringAmountValidator } from "./amounts.js";

export const amountCryptoScalar = defineScalar({
  name: "Amount_Crypto",
  builderName: "AmountCrypto",
  description: "A crypto amount carrying a string value and a string unit.",
  representation: "json-object",
  validator: stringAmountValidator,
  zodSource: "z.object({ unit: z.string(), value: z.string() })",
  typescriptType: "{ unit: string, value: string }",
  coercion: stringAmountCoercion,
  zero: {
    kind: "none",
    reason: "a crypto amount has no meaningful empty value or unit",
  },
});
