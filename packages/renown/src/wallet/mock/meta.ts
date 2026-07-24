import type { WalletAdapterMeta } from "../types.js";

// Dependency-free descriptor (see privy/meta.ts). The mock signer has no
// full-page OAuth redirect.
export const mockAdapterMeta: WalletAdapterMeta = {
  id: "mock",
  redirectReturnParams: [],
};
