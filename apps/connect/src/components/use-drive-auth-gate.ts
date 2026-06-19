import {
  useConnectionStates,
  useUser,
  type ConnectionStateSnapshot,
} from "@powerhousedao/reactor-browser";

/** Gate an anonymous user only when a remote failed with an auth rejection
 * (`requiresAuth`) — the switchboard refusing the caller for lack of login. */
export function computeNeedsLogin(
  isAuthenticated: boolean,
  connectionStates: ReadonlyMap<string, ConnectionStateSnapshot>,
): boolean {
  if (isAuthenticated) return false;
  for (const snap of connectionStates.values()) {
    if (snap.state === "error" && snap.requiresAuth) return true;
  }
  return false;
}

/** Live wrapper over {@link computeNeedsLogin}. */
export function useDriveAuthGate(): { needsLogin: boolean } {
  const user = useUser();
  const connectionStates = useConnectionStates();
  return { needsLogin: computeNeedsLogin(Boolean(user), connectionStates) };
}
