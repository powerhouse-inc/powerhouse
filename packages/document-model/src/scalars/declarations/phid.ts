import { z } from "zod";
import { defineCatalogScalar } from "../define-catalog-scalar.js";

export const phidScalar = defineCatalogScalar({
  name: "PHID",
  typescriptType: "string",
  zodSource: "z.string()",
  schema: z.string(),
  representation: "string",
});
