import type { WalletAdapterMeta } from "../types.js";

// Dependency-free descriptor (see privy/meta.ts). Injected wallets have no
// full-page OAuth redirect, so no redirect-return params.
export const rainbowAdapterMeta: WalletAdapterMeta = {
  id: "rainbow",
  redirectReturnParams: [],
};
