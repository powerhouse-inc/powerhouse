import { z } from "zod";
import { defineScalar } from "../define-scalar.js";

export type Address = `${string}:0x${string}`;

/**
 * A regex-only predicate copied from codegen's scalarsValidation. It coerces a
 * nonstring to a string before testing, so a singleton array holding a valid
 * value passes; the catalog reproduces that rather than narrowing it.
 */
const addressValidator = z.custom<Address>((value) =>
  /^[a-zA-Z0-9]+:0x[a-fA-F0-9]{40}$/.test(value as string),
);

export const addressScalar = defineScalar({
  name: "Address",
  description: "A CAIP-style address with a hexadecimal account segment.",
  representation: "string",
  validator: addressValidator,
  zodSource:
    "z.custom<`${string}:0x${string}`>((val) => /^[a-zA-Z0-9]+:0x[a-fA-F0-9]{40}$/.test(val as string))",
  typescriptType: "`${string}:0x${string}`",
});
