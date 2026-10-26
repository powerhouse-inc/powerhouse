import {
  logout,
  openRenown,
  useBackendAuth,
  useUser,
} from "@powerhousedao/reactor-browser";
import type { BackendAuthGateMode } from "../runtime/backend-auth-gate.js";

// The decision lives with the runtime, so a root view outside this chunk
// (Connect's own) can take it without loading every core view.
export { useBackendAuthGate } from "../runtime/backend-auth-gate.js";
export type { BackendAuthGateMode } from "../runtime/backend-auth-gate.js";

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
