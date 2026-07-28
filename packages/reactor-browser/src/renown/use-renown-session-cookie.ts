"use client";

import type { RenownSessionProfile } from "@renown/sdk";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useRenown } from "../hooks/renown.js";
import { useRenownAuth } from "./use-renown-auth.js";

const DEFAULT_ENDPOINT = "/api/renown/session";
const DEFAULT_EXPIRES_IN = 7 * 24 * 60 * 60; // 7 days, in seconds

export interface RenownSessionCookieOptions {
  /** Route handler that sets (POST) / clears (DELETE) the session cookie. */
  endpoint?: string;
  /** Bearer-token lifetime in seconds (default 7 days). */
  expiresIn?: number;
  /** When false the hook is inert (client-only apps with no server cookie). */
  enabled?: boolean;
}

export interface RenownSessionCookieState {
  /** True once the cookie reflects the current authenticated user. */
  synced: boolean;
}

// Mirrors Renown auth into a server-readable session cookie: mints a bearer
// token on login and POSTs it; DELETEs on logout. Mount inside the provider.
export function useRenownSessionCookie(
  options: RenownSessionCookieOptions = {},
): RenownSessionCookieState {
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  const expiresIn = options.expiresIn ?? DEFAULT_EXPIRES_IN;
  const enabled = options.enabled ?? true;
  const { user, displayName, avatarUrl } = useRenownAuth();
  const renown = useRenown();
  const address = user?.address;
  const profile = user?.profile;
  // Whether a prior render was authenticated, so we only DELETE on real logout
  // (not on an unauthenticated first load, which must not clobber the cookie).
  const hadUser = useRef(false);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const ready = !!renown && typeof renown.getBearerToken === "function";
    if (address && ready) {
      hadUser.current = true;
      setSynced(false);
      let cancelled = false;
      void (async () => {
        try {
          const token = await renown!.getBearerToken({ expiresIn });
          await fetch(endpoint, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              token,
              // The richer fields let verifyRenownSession seed a `user.profile`
              // matching this one, so SSR renders the same identity.
              profile: {
                name: displayName ?? null,
                avatar: avatarUrl ?? null,
                documentId: profile?.documentId ?? null,
                username: profile?.username ?? null,
                userImage: profile?.userImage ?? null,
              } satisfies RenownSessionProfile,
            }),
          });
          if (!cancelled) setSynced(true);
        } catch (error) {
          console.error("Failed to sync Renown session cookie", error);
        }
      })();
      return () => {
        cancelled = true;
      };
    }
    if (!address) {
      setSynced(false);
      if (hadUser.current) {
        hadUser.current = false;
        void fetch(endpoint, { method: "DELETE" }).catch(() => {});
      }
    }
  }, [
    address,
    displayName,
    avatarUrl,
    profile?.documentId,
    profile?.username,
    profile?.userImage,
    renown,
    endpoint,
    expiresIn,
    enabled,
  ]);

  return { synced };
}

const RenownSessionSyncedContext = createContext(false);
export { RenownSessionSyncedContext };

// True once the session cookie reflects the current authenticated user — gate a
// post-login navigation on this so the server-side proxy sees the cookie.
export function useRenownSessionSynced(): boolean {
  return useContext(RenownSessionSyncedContext);
}
