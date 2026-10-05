import { z } from "zod";
import { defineScalar } from "../define-scalar.js";

export const urlScalar = defineScalar({
  name: "URL",
  description: "A URL string.",
  representation: "string",
  validator: z.url(),
  zodSource: "z.url()",
});
