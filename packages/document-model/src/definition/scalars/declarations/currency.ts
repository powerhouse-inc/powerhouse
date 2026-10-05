import { z } from "zod";
import { defineScalar } from "../define-scalar.js";

export const currencyScalar = defineScalar({
  name: "Currency",
  description: "A currency code string.",
  representation: "string",
  validator: z.string(),
  zodSource: "z.string()",
  zero: { kind: "value", value: "" },
});
