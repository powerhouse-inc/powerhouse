import { z } from "zod";
import { defineCatalogScalar } from "../define-catalog-scalar.js";

export const amountScalar = defineCatalogScalar({
  name: "Amount",
  typescriptType: "{ unit?: string, value?: number }",
  zodSource: "z.object({ unit: z.string().optional(), value: z.number() })",
  schema: z.object({ unit: z.string().optional(), value: z.number() }),
});
