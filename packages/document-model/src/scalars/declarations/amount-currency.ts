import { z } from "zod";
import { defineCatalogScalar } from "../define-catalog-scalar.js";

export const amountCurrencyScalar = defineCatalogScalar({
  name: "Amount_Currency",
  typescriptType: "{ unit: string, value: string }",
  zodSource: "z.object({ unit: z.string(), value: z.string()})",
  schema: z.object({ unit: z.string(), value: z.string() }),
});
