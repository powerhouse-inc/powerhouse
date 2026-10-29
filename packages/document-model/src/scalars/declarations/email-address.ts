import { z } from "zod";
import { defineCatalogScalar } from "../define-catalog-scalar.js";

export const emailAddressScalar = defineCatalogScalar({
  name: "EmailAddress",
  typescriptType: "string",
  zodSource: "z.email()",
  schema: z.email(),
  representation: "string",
});
