import { z } from "zod";
import type { ScalarCoercion } from "../declaration.js";
import { defineScalar } from "../define-scalar.js";
import { scalarLiteralValue } from "../scalar-literal.js";

const identityCoercion: ScalarCoercion<unknown> = {
  parseValue: (value) => value,
  parseLiteral: scalarLiteralValue,
  serialize: (value) => value,
};

export const unknownScalar = defineScalar({
  name: "Unknown",
  description:
    "An unconstrained value accepted by the current z.unknown validator.",
  representation: "opaque",
  validator: z.unknown(),
  zodSource: "z.unknown()",
  coercion: identityCoercion,
  zero: { kind: "value", value: null },
});
