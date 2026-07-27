import type { WalletAdapterMeta } from "../types.js";

// Dependency-free descriptor, safe to import eagerly (pulls no wallet library);
// the heavy createPrivyAdapter factory stays behind a dynamic import.
export const privyAdapterMeta: WalletAdapterMeta = {
  id: "privy",
  redirectReturnParams: ["privy_oauth_code", "privy_oauth_state"],
};
