import { z } from "zod";
import { defineScalar } from "../define-scalar.js";

export const dateScalar = defineScalar({
  name: "Date",
  description: "An ISO 8601 datetime string used by the installed Date scalar.",
  representation: "string",
  validator: z.iso.datetime(),
  zodSource: "z.iso.datetime()",
});
