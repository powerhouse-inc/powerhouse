"use client";

import { readPersistedUser, type User } from "@renown/sdk";
import type { WalletAdaptersConfig, WalletTheme } from "@renown/sdk/wallet";
import { useMemo, type ReactNode } from "react";
import { RenownInitialUserProvider } from "./initial-user.js";
import { Renown } from "./renown-init.js";
import {
  RenownSessionSyncedContext,
  useRenownSessionCookie,
} from "./use-renown-session-cookie.js";
import { RenownWalletProvider } from "./wallet-provider.js";

export interface RenownProviderProps {
  appName: string;
  /** Prefix for localStorage keys, so multiple apps can share a domain. */
  namespace?: string;
  url?: string;
  switchboardUrl?: string;
  /** Wallet adapters for in-page sign-in; omit for redirect-only. */
  adapters?: WalletAdaptersConfig;
  theme?: WalletTheme;
  /** Re-check the restored credential against the source (default "always"). */
  revalidate?: "always" | "never";
  /** Server-resolved session (SSR); its presence seeds from the cookie + enables cookie sync. Omit for client-only (seed = localStorage). */
  session?: { user?: User } | null;
  /** Endpoint for the session-cookie sync (SSR). Default /api/renown/session. */
  sessionEndpoint?: string;
  onError?: (error: unknown) => void;
  children: ReactNode;
}

// Runs the cookie sync and publishes its `synced` state to descendants, so a
// post-login navigation can wait for the cookie (see useRenownSessionSynced).
function SessionSync({
  enabled,
  endpoint,
  children,
}: {
  enabled: boolean;
  endpoint?: string;
  children: ReactNode;
}) {
  const { synced } = useRenownSessionCookie({ endpoint, enabled });
  return (
    <RenownSessionSyncedContext.Provider value={synced}>
      {children}
    </RenownSessionSyncedContext.Provider>
  );
}

// One-stop Renown provider: initializes the SDK, seeds the first render (cookie
// for SSR, localStorage for client-only), mounts wallets, and syncs the cookie.
export function RenownProvider({
  appName,
  namespace,
  url,
  switchboardUrl,
  adapters,
  theme,
  revalidate,
  session,
  sessionEndpoint,
  onError,
  children,
}: RenownProviderProps) {
  const isServerSession = session !== undefined;
  const seed = useMemo<User | undefined>(() => {
    if (isServerSession) return session?.user ?? undefined;
    return readPersistedUser(namespace);
  }, [isServerSession, session, namespace]);

  return (
    <>
      <Renown
        appName={appName}
        namespace={namespace}
        url={url}
        switchboardUrl={switchboardUrl}
        revalidate={revalidate}
        onError={onError}
      />
      <RenownInitialUserProvider initialUser={seed}>
        <RenownWalletProvider adapters={adapters} theme={theme}>
          <SessionSync enabled={isServerSession} endpoint={sessionEndpoint}>
            {children}
          </SessionSync>
        </RenownWalletProvider>
      </RenownInitialUserProvider>
    </>
  );
}
