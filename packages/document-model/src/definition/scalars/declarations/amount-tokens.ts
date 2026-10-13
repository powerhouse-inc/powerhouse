import { defineScalar } from "../define-scalar.js";
import { numberAmountFields } from "./amounts.js";

export const amountTokensScalar = defineScalar({
  name: "Amount_Tokens",
  builderName: "Tokens",
  description: "A token amount.",
  ...numberAmountFields,
});
