import { z } from "zod";
import { defineScalar } from "../define-scalar.js";

export const oLabelScalar = defineScalar({
  name: "OLabel",
  description: "An opaque object label.",
  representation: "string",
  validator: z.string(),
  zodSource: "z.string()",
  zero: { kind: "value", value: "" },
});
