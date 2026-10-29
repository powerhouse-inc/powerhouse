import { z } from "zod";
import { defineCatalogScalar } from "../define-catalog-scalar.js";

export const dateScalar = defineCatalogScalar({
  example: "2024-01-01T00:00:00.000Z",
  name: "Date",
  typescriptType: "string",
  zodSource: "z.iso.datetime()",
  schema: z.iso.datetime(),
  representation: "string",
});
