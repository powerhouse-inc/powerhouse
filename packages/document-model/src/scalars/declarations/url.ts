import { z } from "zod";
import { defineCatalogScalar } from "../define-catalog-scalar.js";

export const urlScalar = defineCatalogScalar({
  example: "https://example.com",
  name: "URL",
  typescriptType: "string",
  zodSource: "z.url()",
  schema: z.url(),
});
