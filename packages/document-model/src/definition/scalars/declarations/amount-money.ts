import { defineScalar } from "../define-scalar.js";
import { numberAmountFields } from "./amounts.js";

export const amountMoneyScalar = defineScalar({
  name: "Amount_Money",
  builderName: "Money",
  description: "A monetary amount represented as a number.",
  ...numberAmountFields,
});
