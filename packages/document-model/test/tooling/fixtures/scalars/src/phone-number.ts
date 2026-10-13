import { defineScalar } from "document-model";
import { z } from "zod";

/** A package scalar, declared the way every catalog scalar is. */
export const PhoneNumber = defineScalar({
  name: "PhoneNumber",
  description: "An E.164 phone number.",
  representation: "string",
  validator: z.string().regex(/^\+[1-9]\d{1,14}$/),
  zodSource: "z.string().regex(/^\\+[1-9]\\d{1,14}$/)",
});
