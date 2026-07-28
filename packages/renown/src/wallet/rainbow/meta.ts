import { LoginMethod, type WalletAdapterMeta } from "../types.js";

// Config slice this adapter consumes; operators pass the same shape from
// powerhouse.config.json. No `methods`: this adapter only does wallet login.
export interface PHRenownRainbowAdapterConfig {
  // Optional: when unset the WalletConnect option is hidden; injected/browser
  // wallets (MetaMask, etc.) still work. See buildWagmiConfig.
  walletConnectProjectId?: string;
  infuraProjectId?: string;
  appName?: string;
  // Opt-in for server-rendered hosts (e.g. Next.js) so wagmi defers its hydrate
  // reconnect to an effect instead of running it during render.
  ssr?: boolean;
}

export const RAINBOW_METHODS: LoginMethod[] = [LoginMethod.WALLET];

// Dependency-free identity (see privy/meta.ts). Injected wallets have no
// full-page OAuth redirect, so no redirect-return params.
export const rainbowAdapterMeta: WalletAdapterMeta = {
  id: "rainbow",
  redirectReturnParams: [],
  supportedMethods: RAINBOW_METHODS,
};
