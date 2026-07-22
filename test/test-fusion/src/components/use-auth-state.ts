"use client";

import { useRenownAuth } from "@powerhousedao/reactor-browser/renown";

export type AuthState = "authenticated" | "resolving" | "unauthenticated";

// Collapse Renown's auth status into a routing decision. `user` presence is the
// reliable "authenticated" signal (a stored session rests at status "initial").
export function useAuthState(): AuthState {
  const { user, status, pending } = useRenownAuth();
  if (user) return "authenticated";
  if (
    pending ||
    status === undefined ||
    status === "loading" ||
    status === "checking"
  ) {
    return "resolving";
  }
  return "unauthenticated";
}
