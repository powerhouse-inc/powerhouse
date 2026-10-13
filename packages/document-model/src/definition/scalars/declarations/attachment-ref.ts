import { z } from "zod";
import { defineScalar } from "../define-scalar.js";

export type AttachmentRef = `attachment://v${number}:${string}`;

/** Same regex-only, string-coercing predicate as Address; see address.ts. */
const attachmentRefValidator = z.custom<AttachmentRef>((value) =>
  /^attachment:\/\/v\d+:.+$/.test(value as string),
);

export const attachmentRefScalar = defineScalar({
  name: "AttachmentRef",
  description: "A versioned attachment reference.",
  representation: "string",
  validator: attachmentRefValidator,
  zodSource:
    "z.custom<`attachment://v${number}:${string}`>((val) => /^attachment:\\/\\/v\\d+:.+$/.test(val as string))",
  typescriptType: "`attachment://v${number}:${string}`",
});
