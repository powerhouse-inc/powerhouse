import { z } from "zod";
import { defineCatalogScalar } from "../define-catalog-scalar.js";
import { matchesScalarPattern } from "../pattern.js";

export const attachmentRefScalar = defineCatalogScalar({
  example:
    "attachment://v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  name: "AttachmentRef",
  typescriptType: "`attachment://v${number}:${string}`",
  zodSource:
    "z.custom<`attachment://v${number}:${string}`>((val) => /^attachment:\\/\\/v\\d+:.+$/.test(val as string))",
  schema: z.custom<`attachment://v${number}:${string}`>((val) =>
    matchesScalarPattern(/^attachment:\/\/v\d+:.+$/, val),
  ),
  representation: "string",
});
