"use client";

import { useContext } from "react";
import { RenownUserContext } from "../providers/renown-user-provider.js";

/**
 * useUser Hook - Access user context
 *
 * Provides access to the current user and authentication methods.
 * Must be used within a RenownUserProvider.
 *
 * @throws Error if used outside of RenownUserProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { user, loginStatus, isLoading, login, logout, openRenown, renownCrypto, renown } = useUser()
 *
 *   if (isLoading) return <div>Loading...</div>
 *   if (!user) return <button onClick={openRenown}>Login</button>
 *   return <div>Welcome {user.name || user.did}</div>
 * }
 * ```
 */
export function useUser() {
  const context = useContext(RenownUserContext);

  if (!context) {
    throw new Error("useUser must be used within a RenownUserProvider");
  }

  return context;
}
