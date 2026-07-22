import { useMemo, type ComponentType, type ReactNode } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { normalizeWalletTheme, type WalletTheme } from "../types.js";
import type { PrivyCore } from "./adapter.js";
import { PrivyAdapterBridge } from "./bridge.js";

interface PrivyProviderConfig {
  appId: string;
  clientId?: string;
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
    const { mode } = normalizeWalletTheme(theme);
    // Memoize so a new config object per render doesn't rebuild PrivyProvider's
    // context and cascade re-renders into descendants.
    const privyConfig = useMemo(
      () => ({
        appearance: { theme: mode },
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" as const },
          showWalletUIs: false,
        },
      }),
      [mode],
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
