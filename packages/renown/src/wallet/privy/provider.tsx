import { useMemo, type ComponentType, type ReactNode } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { normalizeWalletTheme, type WalletTheme } from "../types.js";
import type { PrivyCore } from "./adapter.js";
import { PrivyAdapterBridge } from "./bridge.js";
import { buildPrivyClientConfig } from "./client-config.js";
import type { PrivyChain } from "./meta.js";
import { toPrivyAccentColor } from "./theme.js";

interface PrivyProviderConfig {
  appId: string;
  clientId?: string;
  chain?: PrivyChain;
  walletList?: string[];
}

// Build the adapter Provider bound to a specific core + config. Mounts
// PrivyProvider with embedded wallets + showWalletUIs:false for silent signing.
export function createPrivyProvider(
  core: PrivyCore,
  config: PrivyProviderConfig,
): ComponentType<{ children: ReactNode; theme?: WalletTheme }> {
  return function PrivyAuthProvider({
    children,
    theme,
  }: {
    children: ReactNode;
    theme?: WalletTheme;
  }) {
    const { mode, accentColor } = normalizeWalletTheme(theme);
    const accent = toPrivyAccentColor(accentColor);
    const { chain, walletList } = config;
    // Memoize so a new config object per render doesn't rebuild PrivyProvider's
    // context and cascade re-renders into descendants.
    const privyConfig = useMemo(
      () =>
        buildPrivyClientConfig({
          methods: core.supportedMethods,
          mode,
          accentColor: accent,
          chain,
          walletList,
        }),
      [mode, accent, chain, walletList],
    );

    return (
      <PrivyProvider
        appId={config.appId}
        clientId={config.clientId}
        config={privyConfig}
      >
        <PrivyAdapterBridge core={core} />
        {children}
      </PrivyProvider>
    );
  };
}
