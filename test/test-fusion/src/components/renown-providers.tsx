"use client";

import { RenownProvider } from "@powerhousedao/reactor-browser/renown";
import type { User } from "@renown/sdk";
import type { WalletTheme } from "@renown/sdk/wallet";
import { useEffect, useState, type ReactNode } from "react";
import {
  RENOWN_APP_NAME,
  SWITCHBOARD_URL,
  WALLET_ADAPTERS,
} from "@/lib/renown";

// Follows the OS light/dark preference so the wallet UIs match the page.
function usePreferredMode(): "light" | "dark" {
  const [mode, setMode] = useState<"light" | "dark">("light");
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setMode(mq.matches ? "dark" : "light");
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return mode;
}

// One provider: SDK init, first-render seed, wallets, and session-cookie sync.
export function RenownProviders({
  children,
  session,
}: {
  children: ReactNode;
  session?: { user?: User } | null;
}) {
  const theme: WalletTheme = usePreferredMode();
  return (
    <RenownProvider
      appName={RENOWN_APP_NAME}
      namespace={RENOWN_APP_NAME}
      switchboardUrl={SWITCHBOARD_URL}
      adapters={WALLET_ADAPTERS}
      theme={theme}
      session={session}
      onError={(e) => console.error("Renown init failed", e)}
    >
      {children}
    </RenownProvider>
  );
}
