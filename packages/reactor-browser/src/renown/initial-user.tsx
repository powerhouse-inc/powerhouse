"use client";

import type { User } from "@renown/sdk";
import { createContext, useContext, type ReactNode } from "react";

/** Whether the first render already knows who (if anyone) is signed in. */
// "anonymous" is load-bearing: it separates a signed-out visitor from an
// unresolved one, which otherwise both have to render a spinner.
export type RenownInitialAuth =
  | { state: "authenticated"; user: User }
  | { state: "anonymous" }
  | { state: "unknown" };

export const RENOWN_INITIAL_UNKNOWN: RenownInitialAuth = { state: "unknown" };
export const RENOWN_INITIAL_ANONYMOUS: RenownInitialAuth = {
  state: "anonymous",
};

// Seeds the auth store's first render (server + hydration) from a session
// cookie or localStorage, enabling authenticated SSR without a flash.
const RenownInitialUserContext = createContext<RenownInitialAuth>(
  RENOWN_INITIAL_UNKNOWN,
);

export interface RenownInitialUserProviderProps {
  /** Resolved first-render auth (see `RenownProvider`). Takes precedence over `initialUser`. */
  initialAuth?: RenownInitialAuth;
  /** User resolved from a verified session cookie (see `verifyRenownSession`). */
  initialUser?: User;
  children: ReactNode;
}

export function RenownInitialUserProvider({
  initialAuth,
  initialUser,
  children,
}: RenownInitialUserProviderProps) {
  // `initialUser` alone cannot express "anonymous" — absence stays "unknown".
  const value =
    initialAuth ??
    (initialUser
      ? { state: "authenticated" as const, user: initialUser }
      : RENOWN_INITIAL_UNKNOWN);
  return (
    <RenownInitialUserContext.Provider value={value}>
      {children}
    </RenownInitialUserContext.Provider>
  );
}

/** First-render auth as a three-state value; use this to skip a spinner when anonymous. */
export function useRenownInitialAuth(): RenownInitialAuth {
  return useContext(RenownInitialUserContext);
}

export function useRenownInitialUser(): User | undefined {
  const initial = useRenownInitialAuth();
  return initial.state === "authenticated" ? initial.user : undefined;
}
