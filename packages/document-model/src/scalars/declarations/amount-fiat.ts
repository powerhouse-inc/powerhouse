import { z } from "zod";
import { validatingCoercion } from "../coercion.js";
import { defineCatalogScalar } from "../define-catalog-scalar.js";
import {
  floatOnlyNumber,
  literalString,
  objectFields,
} from "../scalar-literal.js";

const schema = z.object({ unit: z.string(), value: z.number() });

export const amountFiatScalar = defineCatalogScalar({
  name: "Amount_Fiat",
  typescriptType: "{ unit: string, value: number }",
  zodSource: "z.object({ unit: z.string(), value: z.number() })",
  schema,
  representation: "json-object",
  coercion: validatingCoercion(schema, (node) => {
    const fields = objectFields(node);
    return {
      unit: literalString(fields.get("unit"), "unit"),
      value: floatOnlyNumber(fields.get("value"), "value"),
    };
  }),
});
