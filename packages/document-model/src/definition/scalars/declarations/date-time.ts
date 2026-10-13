import { z } from "zod";
import { defineScalar } from "../define-scalar.js";

export const dateTimeScalar = defineScalar({
  name: "DateTime",
  description: "An ISO 8601 datetime string.",
  representation: "string",
  validator: z.iso.datetime(),
  zodSource: "z.iso.datetime()",
});
