"use client";

import {
  Renown,
  RenownWalletProvider,
} from "@powerhousedao/reactor-browser/renown";
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

// Initializes the Renown SDK once and mounts the shared wallet provider around
// the whole app, so auth state (useRenownAuth) is available on every route.
export function RenownProviders({ children }: { children: ReactNode }) {
  const theme: WalletTheme = usePreferredMode();
  return (
    <>
      <Renown
        appName={RENOWN_APP_NAME}
        namespace={RENOWN_APP_NAME}
        switchboardUrl={SWITCHBOARD_URL}
        onError={(e) => console.error("Renown init failed", e)}
      />
      <RenownWalletProvider adapters={WALLET_ADAPTERS} theme={theme}>
        {children}
      </RenownWalletProvider>
    </>
  );
}
