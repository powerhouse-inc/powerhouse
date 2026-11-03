import { defineScalar } from "document-model/scalars";
import { z } from "zod";

export const Iban = defineScalar({
  name: "Iban",
  description: "International bank account number",
  schema: z.string().regex(/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/),
  example: "DE89370400440532013000",
});
