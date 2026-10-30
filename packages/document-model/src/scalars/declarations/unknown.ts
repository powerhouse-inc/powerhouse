import { z } from "zod";
import { defineCatalogScalar } from "../define-catalog-scalar.js";
import { scalarLiteralValue } from "../scalar-literal.js";

export const unknownScalar = defineCatalogScalar({
  name: "Unknown",
  typescriptType: "unknown",
  zodSource: "z.unknown()",
  schema: z.unknown(),
  representation: "opaque",
  coercion: {
    parseValue: (value) => value,
    parseLiteral: scalarLiteralValue,
    serialize: (value) => value,
  },
});
