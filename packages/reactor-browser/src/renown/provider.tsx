"use client";

import { readPersistedUser, type User } from "@renown/sdk";
import type { WalletAdapterDescriptor, WalletTheme } from "@renown/sdk/wallet";
import { useMemo, useSyncExternalStore, type ReactNode } from "react";
import {
  RENOWN_INITIAL_ANONYMOUS,
  RENOWN_INITIAL_UNKNOWN,
  RenownInitialUserProvider,
  type RenownInitialAuth,
} from "./initial-user.js";
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
  /** Wallet adapter descriptors for in-page sign-in (see {@link RenownWalletProvider}); omit for redirect-only. */
  adapters?: WalletAdapterDescriptor[];
  theme?: WalletTheme;
  /** Re-check the restored credential against the source (default "always"). */
  revalidate?: "always" | "never";
  /** Chain id credentials are issued on (default 1). Keep the adapters' chains in step: it is part of the user's DID, so a wallet on another chain is rejected. */
  chainId?: number;
  /** Server-resolved session (SSR); its presence seeds from the cookie + enables cookie sync. Omit for client-only (seed = localStorage). */
  session?: { user?: User } | null;
  /** Endpoint for the session-cookie sync (SSR). Default /api/renown/session. */
  sessionEndpoint?: string;
  onError?: (error: unknown) => void;
  children: ReactNode;
}

const subscribeNothing = () => () => {};

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
  chainId,
  session,
  sessionEndpoint,
  onError,
  children,
}: RenownProviderProps) {
  const isServerSession = session !== undefined;
  // Hydration must match SSR, so the cookie answers first and localStorage
  // takes over once mounted.
  const mounted = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  const seed = useMemo<RenownInitialAuth>(() => {
    // localStorage holds the credential the SDK actually restores; the cookie is
    // a display hint that is server-only and can go stale independently.
    if (mounted) {
      const persisted = readPersistedUser(namespace);
      return persisted
        ? { state: "authenticated", user: persisted }
        : RENOWN_INITIAL_ANONYMOUS;
    }
    if (!isServerSession) return RENOWN_INITIAL_UNKNOWN;
    return session?.user
      ? { state: "authenticated", user: session.user }
      : RENOWN_INITIAL_ANONYMOUS;
  }, [mounted, isServerSession, session, namespace]);

  return (
    <>
      <Renown
        appName={appName}
        namespace={namespace}
        url={url}
        switchboardUrl={switchboardUrl}
        revalidate={revalidate}
        chainId={chainId}
        onError={onError}
      />
      <RenownInitialUserProvider initialAuth={seed}>
        <RenownWalletProvider adapters={adapters} theme={theme}>
          <SessionSync enabled={isServerSession} endpoint={sessionEndpoint}>
            {children}
          </SessionSync>
        </RenownWalletProvider>
      </RenownInitialUserProvider>
    </>
  );
}
