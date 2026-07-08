import {
  useConnectionStates,
  useUser,
  type ConnectionStateSnapshot,
} from "@powerhousedao/reactor-browser";

/** Return code for the auth gate decision:
 * - `"login"`  : anonymous user, a channel rejected with `requiresAuth`.
 * - `"unauthorized"` : signed in, but a channel was rejected — they aren't the owner.
 * - `null`   : no auth barrier, carry on. */
export type AuthGate = "login" | "unauthorized" | null;

export function computeAuthGate(
  isAuthenticated: boolean,
  connectionStates: ReadonlyMap<string, ConnectionStateSnapshot>,
): AuthGate {
  let sawAuthError = false;
  for (const snap of connectionStates.values()) {
    if (snap.state === "error" && snap.requiresAuth) {
      sawAuthError = true;
      break;
    }
  }
  if (!sawAuthError) return null;
  return isAuthenticated ? "unauthorized" : "login";
}

/** Live wrapper over {@link computeAuthGate}. */
export function useDriveAuthGate(): { gate: AuthGate } {
  const user = useUser();
  const connectionStates = useConnectionStates();
  return { gate: computeAuthGate(Boolean(user), connectionStates) };
}
