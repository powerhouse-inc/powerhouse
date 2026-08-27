import type { PrivyClientConfig, WalletListEntry } from "@privy-io/react-auth";
import type { Chain } from "viem";
import type { LoginMethod } from "../types.js";
import { PRIVY_METHOD_MAP } from "./adapter.js";
import type { PrivyChain } from "./meta.js";

// Privy's provider root fetches the WalletConnect explorer listings on mount
// unless walletList needs none; externalWallets.* and loginMethods don't gate it.
export const DEFAULT_WALLET_LIST: readonly WalletListEntry[] = [
  "detected_ethereum_wallets",
];

export interface PrivyClientConfigInput {
  methods: LoginMethod[];
  mode: "light" | "dark";
  accentColor?: `#${string}`;
  chain?: PrivyChain;
  walletList?: string[];
}

// Pure so the config shape is testable without mounting PrivyProvider.
export function buildPrivyClientConfig({
  methods,
  mode,
  accentColor,
  chain,
  walletList,
}: PrivyClientConfigInput): PrivyClientConfig {
  // PrivyChain is the structural subset every viem Chain satisfies.
  const pinned = chain as Chain | undefined;
  return {
    // Only the configured methods, so Privy skips the connectors (e.g.
    // WalletConnect) that the unlisted ones would initialize.
    loginMethods: methods.map((method) => PRIVY_METHOD_MAP[method]),
    appearance: {
      // Privy generates its own light/dark variants from the accent.
      theme: mode,
      // Config arrives from JSON, so entries are unvalidated here.
      walletList: [...(walletList ?? DEFAULT_WALLET_LIST)] as WalletListEntry[],
      ...(accentColor ? { accentColor } : {}),
    },
    // Renown rejects a wallet on any chain but the one it issues on.
    ...(pinned ? { defaultChain: pinned, supportedChains: [pinned] } : {}),
    embeddedWallets: {
      ethereum: { createOnLogin: "users-without-wallets" },
      showWalletUIs: false,
    },
    // Social/email adapter only (external wallets go through the rainbow
    // adapter), so don't init WalletConnect / fetch its registry on mount.
    externalWallets: {
      disableAllExternalWallets: true,
      walletConnect: { enabled: false },
    },
  };
}
