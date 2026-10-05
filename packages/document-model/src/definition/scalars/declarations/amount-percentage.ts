import { defineScalar } from "../define-scalar.js";
import { numberAmountFields } from "./amounts.js";

export const amountPercentageScalar = defineScalar({
  name: "Amount_Percentage",
  builderName: "Percentage",
  description: "A numeric percentage amount.",
  ...numberAmountFields,
});
