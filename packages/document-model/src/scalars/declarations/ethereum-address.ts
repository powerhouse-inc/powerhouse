import { z } from "zod";
import { defineCatalogScalar } from "../define-catalog-scalar.js";

export const ethereumAddressScalar = defineCatalogScalar({
  name: "EthereumAddress",
  typescriptType: "string",
  zodSource:
    "z.string().regex(/^0x[a-fA-F0-9]{40}$/, { error: 'Invalid Ethereum address format' })",
  schema: z.string().regex(/^0x[a-fA-F0-9]{40}$/, {
    error: "Invalid Ethereum address format",
  }),
  representation: "string",
});
