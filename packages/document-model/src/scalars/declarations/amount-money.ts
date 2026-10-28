import { z } from "zod";
import { defineCatalogScalar } from "../define-catalog-scalar.js";

export const amountMoneyScalar = defineCatalogScalar({
  name: "Amount_Money",
  typescriptType: "number",
  zodSource: "z.number()",
  schema: z.number(),
});
