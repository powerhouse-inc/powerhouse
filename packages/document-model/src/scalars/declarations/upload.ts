import { z } from "zod";
import { defineCatalogScalar } from "../define-catalog-scalar.js";

export const uploadScalar = defineCatalogScalar({
  name: "Upload",
  typescriptType: "File",
  zodSource: "z.any()",
  schema: z.any(),
  representation: "opaque",
  coercion: {
    parseValue: (value) => value,
    parseLiteral: () => {
      throw new TypeError("Upload literals are not supported.");
    },
    serialize: (value) => value,
  },
});
