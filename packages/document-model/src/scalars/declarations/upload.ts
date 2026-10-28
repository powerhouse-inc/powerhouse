import { z } from "zod";
import { defineCatalogScalar } from "../define-catalog-scalar.js";

export const uploadScalar = defineCatalogScalar({
  name: "Upload",
  typescriptType: "File",
  zodSource: "z.any()",
  schema: z.any(),
});
