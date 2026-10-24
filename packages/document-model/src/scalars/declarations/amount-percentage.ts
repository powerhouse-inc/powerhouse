import { z } from "zod";
import { defineCatalogScalar } from "../define-catalog-scalar.js";

export const amountPercentageScalar = defineCatalogScalar({
  name: "Amount_Percentage",
  typescriptType: "number",
  zodSource: "z.number()",
  schema: z.number(),
});
