import { z } from "zod";
import { defineCatalogScalar } from "../define-catalog-scalar.js";

export const currencyScalar = defineCatalogScalar({
  name: "Currency",
  typescriptType: "string",
  zodSource: "z.string()",
  schema: z.string(),
  representation: "string",
});
