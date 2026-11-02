import { z } from "zod";
import { defineCatalogScalar } from "../define-catalog-scalar.js";

export const jsonObjectScalar = defineCatalogScalar({
  name: "JSONObject",
  typescriptType: null,
  zodSource: null,
  schema: z.record(z.string(), z.unknown()),
  representation: "json-object",
});
