import { z } from "zod";
import { defineCatalogScalar } from "../define-catalog-scalar.js";

export const dateTimeScalar = defineCatalogScalar({
  example: "2024-01-01T00:00:00.000Z",
  name: "DateTime",
  typescriptType: "string",
  zodSource: "z.iso.datetime()",
  schema: z.iso.datetime(),
});
