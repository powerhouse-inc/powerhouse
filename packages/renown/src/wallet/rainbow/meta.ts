import { LoginMethod, type WalletAdapterMeta } from "../types.js";

// Any `wagmi/chains` export satisfies this. Declared here so the module stays
// free of wallet-peer imports, type ones included.
export interface PHRenownChain {
  id: number;
  name: string;
}

// Config slice this adapter consumes; operators pass the same shape from
// powerhouse.config.json. No `methods`: this adapter only does wallet login.
export interface PHRenownRainbowAdapterConfig {
  // Optional, but without it only an installed browser wallet (or a Safe App
  // iframe) can sign in — every other wallet needs it. See buildWagmiConfig.
  walletConnectProjectId?: string;
  infuraProjectId?: string;
  appName?: string;
  // From `wagmi/chains`; defaults to mainnet alone, as each one adds bundle
  // weight. A wallet on a chain outside this list must switch to sign in.
  chains?: readonly [PHRenownChain, ...PHRenownChain[]];
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
