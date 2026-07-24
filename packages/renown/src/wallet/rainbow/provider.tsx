import {
  RainbowKitProvider as RainbowKitProviderRaw,
  darkTheme as rainbowDarkTheme,
  lightTheme as rainbowLightTheme,
} from "@rainbow-me/rainbowkit";
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { useMemo, type ComponentType, type ReactNode } from "react";
import { WagmiProvider, type Config } from "wagmi";
import { normalizeWalletTheme, type WalletTheme } from "../types.js";
import { RainbowAdapterBridge, type RainbowBridge } from "./bridge.js";

// RainbowKit ships types via an exports map with no "types" condition, so
// type-aware lint sees them as error-typed; assert the shapes we rely on.
type RainbowKitTheme = Record<string, unknown>;
interface RainbowThemeOptions {
  accentColor?: string;
  accentColorForeground?: string;
  borderRadius?: "none" | "small" | "medium" | "large";
  fontStack?: "rounded" | "system";
  overlayBlur?: "none" | "small" | "large";
}
const lightTheme = rainbowLightTheme as (
  options?: RainbowThemeOptions,
) => RainbowKitTheme;
const darkTheme = rainbowDarkTheme as (
  options?: RainbowThemeOptions,
) => RainbowKitTheme;
const RainbowKitProvider = RainbowKitProviderRaw as ComponentType<{
  appInfo?: { appName?: string };
  theme?: RainbowKitTheme;
  children?: ReactNode;
}>;

// Map the host theme to a RainbowKit theme: light/dark scheme plus the accent
// colors the host passes in (omitted colors fall back to RainbowKit defaults).
function buildRainbowKitTheme(theme: WalletTheme | undefined): RainbowKitTheme {
  const { mode, accentColor, accentColorForeground } =
    normalizeWalletTheme(theme);
  const options: RainbowThemeOptions = {
    accentColor,
    accentColorForeground,
    borderRadius: "medium",
    fontStack: "system",
    overlayBlur: "small",
  };
  return mode === "dark" ? darkTheme(options) : lightTheme(options);
}

// Build the adapter Provider: mounts wagmi + react-query + RainbowKit and the
// bridge, so useController() (called under it) can drive the connect modal.
export function createRainbowProvider(options: {
  wagmiConfig: Config;
  queryClient: QueryClient;
  bridge: RainbowBridge;
  appName: string;
}): ComponentType<{ children: ReactNode; theme?: WalletTheme }> {
  const { wagmiConfig, queryClient, bridge, appName } = options;

  return function RainbowAuthProvider({
    children,
    theme,
  }: {
    children: ReactNode;
    theme?: WalletTheme;
  }) {
    const rainbowKitTheme = useMemo(() => buildRainbowKitTheme(theme), [theme]);
    return (
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider appInfo={{ appName }} theme={rainbowKitTheme}>
            <RainbowAdapterBridge bridge={bridge} />
            {children}
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    );
  };
}
