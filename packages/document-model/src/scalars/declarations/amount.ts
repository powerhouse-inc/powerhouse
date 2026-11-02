import { z } from "zod";
import { validatingCoercion } from "../coercion.js";
import { defineCatalogScalar } from "../define-catalog-scalar.js";
import {
  floatOnlyNumber,
  literalString,
  objectFields,
} from "../scalar-literal.js";

const schema = z.object({ unit: z.string().optional(), value: z.number() });

export const amountScalar = defineCatalogScalar({
  name: "Amount",
  typescriptType: "{ unit?: string, value?: number }",
  zodSource: "z.object({ unit: z.string().optional(), value: z.number() })",
  schema,
  representation: "json-object",
  coercion: validatingCoercion(schema, (node) => {
    const fields = objectFields(node);
    const unit = fields.get("unit");
    return {
      unit: unit === undefined ? undefined : literalString(unit, "unit"),
      value: floatOnlyNumber(fields.get("value"), "value"),
    };
  }),
});
