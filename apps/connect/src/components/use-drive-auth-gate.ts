import {
  useConnectionStates,
  useUser,
  type ConnectionStateSnapshot,
} from "@powerhousedao/reactor-browser";

/**
 * Pure decision: is the user blocked from a drive purely because they are not
 * logged in? An anonymous user with any remote channel stuck in `"error"` means
 * the auth-enabled studio's sync failed unrecoverably -> needs login. The
 * snapshot carries no error category, so "error + not authenticated" is the
 * signal. Never gate an authenticated user. No window/React access -> testable.
 */
export function computeNeedsLogin(
  isAuthenticated: boolean,
  connectionStates: ReadonlyMap<string, ConnectionStateSnapshot>,
): boolean {
  if (isAuthenticated) return false;
  for (const snap of connectionStates.values()) {
    if (snap.state === "error") return true;
  }
  return false;
}

/** Live wrapper over {@link computeNeedsLogin}. */
export function useDriveAuthGate(): { needsLogin: boolean } {
  const user = useUser();
  const connectionStates = useConnectionStates();
  return { needsLogin: computeNeedsLogin(Boolean(user), connectionStates) };
}
