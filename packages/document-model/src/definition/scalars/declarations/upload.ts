import { z } from "zod";
import { defineScalar } from "../define-scalar.js";

export const uploadScalar = defineScalar({
  name: "Upload",
  description: "An opaque file upload value.",
  representation: "opaque",
  validator: z.any(),
  zodSource: "z.any()",
  typescriptType: "File",
  coercion: {
    parseValue: (value: unknown) => value,
    parseLiteral: () => {
      throw new TypeError("Upload literals are not supported.");
    },
    serialize: (value: unknown) => value,
  },
  persistable: false,
  zero: { kind: "none", reason: "an upload has no persistent zero value" },
});
