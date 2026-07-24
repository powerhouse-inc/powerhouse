"use client";

import { useRenownAuthAsync } from "@powerhousedao/reactor-browser/renown";

export type AuthState = "authenticated" | "resolving" | "unauthenticated";

// Now provided first-class by the SDK; kept as a thin alias so callers that
// import useAuthState stay unchanged.
export function useAuthState(): AuthState {
  return useRenownAuthAsync().state;
}
