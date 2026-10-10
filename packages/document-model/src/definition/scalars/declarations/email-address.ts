import { z } from "zod";
import { defineScalar } from "../define-scalar.js";

export const emailAddressScalar = defineScalar({
  name: "EmailAddress",
  description: "An RFC 822-compatible email address string.",
  representation: "string",
  validator: z.email(),
  zodSource: "z.email()",
});
