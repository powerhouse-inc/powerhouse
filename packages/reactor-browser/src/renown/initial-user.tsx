"use client";

import type { User } from "@renown/sdk";
import { createContext, useContext, type ReactNode } from "react";

// Seeds the auth store's first render (server + hydration) with a user resolved
// server-side from a session cookie, enabling authenticated SSR without a flash.
const RenownInitialUserContext = createContext<User | undefined>(undefined);

export interface RenownInitialUserProviderProps {
  /** User resolved from a verified session cookie (see `verifyRenownSession`). */
  initialUser?: User;
  children: ReactNode;
}

export function RenownInitialUserProvider({
  initialUser,
  children,
}: RenownInitialUserProviderProps) {
  return (
    <RenownInitialUserContext.Provider value={initialUser}>
      {children}
    </RenownInitialUserContext.Provider>
  );
}

export function useRenownInitialUser(): User | undefined {
  return useContext(RenownInitialUserContext);
}
