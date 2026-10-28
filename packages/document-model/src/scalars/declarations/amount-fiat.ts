import { z } from "zod";
import { defineCatalogScalar } from "../define-catalog-scalar.js";

export const amountFiatScalar = defineCatalogScalar({
  name: "Amount_Fiat",
  typescriptType: "{ unit: string, value: number }",
  zodSource: "z.object({ unit: z.string(), value: z.number() })",
  schema: z.object({ unit: z.string(), value: z.number() }),
});
