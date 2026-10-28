import { z } from "zod";
import { defineCatalogScalar } from "../define-catalog-scalar.js";

export const amountTokensScalar = defineCatalogScalar({
  name: "Amount_Tokens",
  typescriptType: "number",
  zodSource: "z.number()",
  schema: z.number(),
});
