import { z } from "zod";
import { defineScalar } from "../define-scalar.js";

export const phidScalar = defineScalar({
  name: "PHID",
  description: "An opaque Powerhouse identifier.",
  representation: "string",
  validator: z.string(),
  zodSource: "z.string()",
  zero: { kind: "value", value: "" },
});
