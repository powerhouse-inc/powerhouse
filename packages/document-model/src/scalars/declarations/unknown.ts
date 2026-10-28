import { z } from "zod";
import { defineCatalogScalar } from "../define-catalog-scalar.js";

export const unknownScalar = defineCatalogScalar({
  name: "Unknown",
  typescriptType: "unknown",
  zodSource: "z.unknown()",
  schema: z.unknown(),
});
