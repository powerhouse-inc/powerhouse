import { z } from "zod";
import { defineScalar } from "../define-scalar.js";

export const ethereumAddressScalar = defineScalar({
  name: "EthereumAddress",
  description: "A 42-character hexadecimal Ethereum address prefixed with 0x.",
  representation: "string",
  validator: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  zodSource:
    "z.string().regex(/^0x[a-fA-F0-9]{40}$/, { error: 'Invalid Ethereum address format' })",
});
