import { z } from "zod";
import { defineScalar } from "../define-scalar.js";

export const oidScalar = defineScalar({
  name: "OID",
  description: "An opaque object identifier.",
  representation: "string",
  validator: z.string(),
  zodSource: "z.string()",
  zero: { kind: "value", value: "" },
});
