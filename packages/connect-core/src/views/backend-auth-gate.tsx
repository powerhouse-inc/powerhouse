import {
  logout,
  openRenown,
  setBackendAuth,
  useBackendAuth,
  useUser,
} from "@powerhousedao/reactor-browser";
import { useEffect } from "react";

/** What the gate shows: nothing, a sign-in, or a "not allowed" notice. */
export type BackendAuthGateMode = "login" | "unauthorized" | null;

/**
 * The gate decision for the app's backend: "login" when the backend refused
 * an anonymous caller, "unauthorized" when it refused a signed-in one.
 *
 * A change of identity (a sign-in landing, a sign-out) clears the refusal:
 * the next boot or drive refresh asks the backend again as the new caller.
 */
export function useBackendAuthGate(): BackendAuthGateMode {
  const refusal = useBackendAuth();
  const user = useUser();
  const address = user?.address;
  const refusedAt = refusal?.at;
  useEffect(() => {
    // Runs when the identity changes AFTER a refusal was recorded; the
    // refusal itself does not change the identity, so this is not a loop.
    return () => {
      if (refusedAt) setBackendAuth(undefined);
    };
  }, [address, refusedAt]);
  if (!refusal) return null;
  // A 403 for a signed-in user is final until they switch account; a 401 for
  // a signed-in user means the token did not reach the backend yet (a stale
  // boot), which signing in again also fixes.
  return address ? "unauthorized" : "login";
}

/**
 * Full-page gate rendered by the root view in place of the routes when the
 * backend refused the caller. Signing in goes through Renown's redirect, so
 * the page comes back with the user and boots again as them.
 */
export function BackendAuthGate({
  mode,
}: {
  mode: Exclude<BackendAuthGateMode, null>;
}) {
  const user = useUser();
  const refusal = useBackendAuth();
  const where = refusal?.backend ? ` (${refusal.backend})` : "";
  return (
    <div
      role="dialog"
      aria-labelledby="backend-auth-gate-title"
      className="flex h-full min-h-[60vh] items-center justify-center p-6"
    >
      <div className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-core-border bg-core-bg p-6 text-core-fg">
        {mode === "login" ? (
          <>
            <h1 id="backend-auth-gate-title" className="text-lg font-semibold">
              Sign in to continue
            </h1>
            <p className="text-sm text-core-muted">
              This server{where} only answers signed-in users. Sign in with
              Renown to open it.
            </p>
            <button
              type="button"
              className="self-start rounded border border-core-border px-3 py-1 hover:bg-core-hover"
              onClick={() => openRenown()}
            >
              Sign in with Renown
            </button>
          </>
        ) : (
          <>
            <h1 id="backend-auth-gate-title" className="text-lg font-semibold">
              This account is not allowed here
            </h1>
            <p className="text-sm text-core-muted">
              You are signed in as{" "}
              <code className="break-all">{user?.address}</code>, but this
              server{where} does not accept that account. Ask its admin for
              access, or switch to another account.
            </p>
            <button
              type="button"
              className="self-start rounded border border-core-border px-3 py-1 hover:bg-core-hover"
              onClick={() => {
                void logout().then(() => openRenown());
              }}
            >
              Switch account
            </button>
          </>
        )}
      </div>
    </div>
  );
}
