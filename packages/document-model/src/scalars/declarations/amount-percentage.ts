import { z } from "zod";
import { defineCatalogScalar } from "../define-catalog-scalar.js";
import { floatAmountCoercion } from "./amounts.js";

const schema = z.number();

export const amountPercentageScalar = defineCatalogScalar({
  name: "Amount_Percentage",
  typescriptType: "number",
  zodSource: "z.number()",
  schema,
  representation: "number",
  coercion: floatAmountCoercion(schema),
});
