import { z } from "zod";
import { defineScalar } from "../define-scalar.js";

export const jsonObjectScalar = defineScalar({
  name: "JSONObject",
  description: "A JSON object with string keys.",
  representation: "json-object",
  validator: z.record(z.string(), z.unknown()),
  zodSource: "z.record(z.string(), z.unknown())",
  zero: { kind: "value", value: {} },
});
