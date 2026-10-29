import { z } from "zod";
import { defineCatalogScalar } from "../define-catalog-scalar.js";
import { stringAmountCoercion } from "./amounts.js";

const schema = z.object({ unit: z.string(), value: z.string() });

export const amountCryptoScalar = defineCatalogScalar({
  name: "Amount_Crypto",
  typescriptType: "{ unit: string, value: string }",
  zodSource: "z.object({ unit: z.string(), value: z.string() })",
  schema,
  representation: "json-object",
  coercion: stringAmountCoercion(schema),
});
