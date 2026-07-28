import { RenownWalletProvider, useTheme } from "@powerhousedao/reactor-browser";
import type { WalletTheme } from "@renown/sdk/wallet";
import { useMemo, type ReactNode } from "react";
import { getRuntimeConfig } from "../runtime-config.js";
import {
  configToDescriptors,
  type ConnectRenownAdapters,
} from "./renown-adapter-descriptors.js";

// Resolve a CSS color expression (a theme token) to a concrete color via a
// hidden probe, so adapters receive Connect's palette without reading the DOM.
function resolveColor(expr: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const probe = document.createElement("span");
  probe.style.color = fallback;
  probe.style.color = expr;
  probe.style.display = "none";
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved || fallback;
}

// Thin Connect wrapper over the shared RenownWalletProvider primitive: supplies
// the configured adapters and Connect's runtime theme (mode + accent colors).
export function RenownWalletProviders({ children }: { children: ReactNode }) {
  const config = getRuntimeConfig().connect.renown?.adapters as
    | ConnectRenownAdapters
    | undefined;
  const { theme } = useTheme();
  // Descriptors carry only eager metadata; no wallet library loads here.
  const adapters = useMemo(() => configToDescriptors(config), [config]);

  // Resolve colors (forced style reads) only when an adapter is configured,
  // so a wallet-less deployment does no probing work at mount.
  const walletTheme = useMemo<WalletTheme | undefined>(
    () =>
      adapters.length > 0
        ? {
            mode: theme,
            accentColor: resolveColor("var(--primary)", "#0084ff"),
            accentColorForeground: resolveColor(
              "var(--primary-foreground)",
              "#ffffff",
            ),
          }
        : undefined,
    [theme, adapters],
  );

  // No adapters configured: the provider's activator/effects are inert, so skip
  // it entirely and keep the wallet controller module off the render path.
  if (adapters.length === 0) return <>{children}</>;

  return (
    <RenownWalletProvider adapters={adapters} theme={walletTheme}>
      {children}
    </RenownWalletProvider>
  );
}
