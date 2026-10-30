import { z } from "zod";
import { defineCatalogScalar } from "../define-catalog-scalar.js";

export const olabelScalar = defineCatalogScalar({
  name: "OLabel",
  typescriptType: "string",
  zodSource: "z.string()",
  schema: z.string(),
  representation: "string",
});
