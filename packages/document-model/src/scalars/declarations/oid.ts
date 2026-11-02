import { z } from "zod";
import { defineCatalogScalar } from "../define-catalog-scalar.js";

export const oidScalar = defineCatalogScalar({
  name: "OID",
  typescriptType: "string",
  zodSource: "z.string()",
  schema: z.string(),
  representation: "string",
});
