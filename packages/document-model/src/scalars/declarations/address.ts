import { z } from "zod";
import { defineCatalogScalar } from "../define-catalog-scalar.js";
import { matchesScalarPattern } from "../pattern.js";

export const addressScalar = defineCatalogScalar({
  example: "eip155:0x0000000000000000000000000000000000000000",
  name: "Address",
  typescriptType: "`${string}:0x${string}`",
  zodSource:
    "z.custom<`${string}:0x${string}`>((val) => /^[a-zA-Z0-9]+:0x[a-fA-F0-9]{40}$/.test(val as string))",
  schema: z.custom<`${string}:0x${string}`>((val) =>
    matchesScalarPattern(/^[a-zA-Z0-9]+:0x[a-fA-F0-9]{40}$/, val),
  ),
});
