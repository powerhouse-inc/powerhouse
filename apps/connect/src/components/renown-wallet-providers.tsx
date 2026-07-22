import { RenownWalletProvider, useTheme } from "@powerhousedao/reactor-browser";
import type { WalletAdaptersConfig, WalletTheme } from "@renown/sdk/wallet";
import { useMemo, type ReactNode } from "react";
import { getRuntimeConfig } from "../runtime-config.js";

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
  const adapters = getRuntimeConfig().connect.renown?.adapters as
    | WalletAdaptersConfig
    | undefined;
  const { theme } = useTheme();

  const walletTheme = useMemo<WalletTheme>(
    () => ({
      mode: theme,
      accentColor: resolveColor("var(--primary)", "#0084ff"),
      accentColorForeground: resolveColor(
        "var(--primary-foreground)",
        "#ffffff",
      ),
    }),
    [theme],
  );

  return (
    <RenownWalletProvider adapters={adapters} theme={walletTheme}>
      {children}
    </RenownWalletProvider>
  );
}
