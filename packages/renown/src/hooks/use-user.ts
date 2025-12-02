"use client";

import { useContext } from "react";
import { UserContext } from "../providers/user-provider.js";

/**
 * useUser Hook - Access user context
 *
 * Provides access to the current user and authentication methods.
 * Must be used within a UserProvider.
 *
 * @throws Error if used outside of UserProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { user, loginStatus, isLoading, login, logout, openRenown } = useUser()
 *
 *   if (isLoading) return <div>Loading...</div>
 *   if (!user) return <button onClick={openRenown}>Login</button>
 *   return <div>Welcome {user.name || user.did}</div>
 * }
 * ```
 */
export function useUser() {
  const context = useContext(UserContext);

  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }

  return context;
}
