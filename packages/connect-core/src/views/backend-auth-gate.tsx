import {
  logout,
  openRenown,
  useBackendAuth,
  useLocalSignIn,
  useUser,
  type LocalSignInState,
} from "@powerhousedao/reactor-browser";
import { useState } from "react";
import type { BackendAuthGateMode } from "../runtime/backend-auth-gate.js";

// The decision lives with the runtime, so a root view outside this chunk
// (Connect's own) can take it without loading every core view.
export { useBackendAuthGate } from "../runtime/backend-auth-gate.js";
export type { BackendAuthGateMode } from "../runtime/backend-auth-gate.js";

const FRESH_LINK =
  "Run `ph dev` (or `ph vetra`) in the project again: it prints a fresh link.";

const buttonClass =
  "self-start rounded border border-core-border px-3 py-1 hover:bg-core-hover disabled:opacity-50";

/**
 * Full-page gate rendered by the root view in place of the routes when the
 * backend refused the caller. Signing in goes through Renown's redirect, so
 * the page comes back with the user and boots again as them. A sign-in to
 * this computer's identity that ended points to a fresh link instead, and a
 * sign-in link that needs the person (a password) is answered here.
 */
export function BackendAuthGate({
  mode,
}: {
  mode: Exclude<BackendAuthGateMode, null>;
}) {
  const user = useUser();
  const refusal = useBackendAuth();
  const localSignIn = useLocalSignIn();
  const where = refusal?.backend ? ` (${refusal.backend})` : "";
  return (
    <div
      role="dialog"
      aria-labelledby="backend-auth-gate-title"
      className="flex h-full min-h-[60vh] items-center justify-center p-6"
    >
      <div className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-core-border bg-core-bg p-6 text-core-fg">
        {mode === "local-sign-in" &&
        localSignIn &&
        localSignIn.status !== "ended" ? (
          <LocalSignInPrompt state={localSignIn} />
        ) : mode === "login" && localSignIn?.status === "ended" ? (
          <>
            <h1 id="backend-auth-gate-title" className="text-lg font-semibold">
              Your sign-in has ended
            </h1>
            <p className="text-sm text-core-muted">
              Your sign-in to this computer&apos;s identity has ended.{" "}
              {FRESH_LINK}
            </p>
            <button
              type="button"
              className={buttonClass}
              onClick={() => openRenown()}
            >
              Sign in with Renown instead
            </button>
          </>
        ) : mode === "login" ? (
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
              className={buttonClass}
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
              className={buttonClass}
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

const FAILED_LINK: Record<string, string> = {
  "used-code": "This sign-in link was used already.",
  "expired-code": "This sign-in link has expired.",
  "bad-code": "This sign-in link is not one of this server's.",
  unreachable: "The server that serves this page did not answer the sign-in.",
};

/** What a sign-in link needs of the person: the key's password, or a note. */
export function LocalSignInPrompt({
  state,
}: {
  state: Exclude<LocalSignInState, { status: "ended" }>;
}) {
  if (state.status === "password") return <PasswordPrompt state={state} />;
  if (state.status === "needs-link") {
    return (
      <>
        <h1 id="backend-auth-gate-title" className="text-lg font-semibold">
          Open this page by its sign-in link
        </h1>
        <p className="text-sm text-core-muted">
          This page is served on this computer, and writes as you only once it
          is opened by its sign-in link. {FRESH_LINK}
        </p>
        <button type="button" className={buttonClass} onClick={state.dismiss}>
          Continue without signing in
        </button>
      </>
    );
  }
  if (state.reason === "renown-login") {
    return (
      <>
        <h1 id="backend-auth-gate-title" className="text-lg font-semibold">
          Sign in with Renown
        </h1>
        <p className="text-sm text-core-muted">
          You are logged in with Renown
          {state.label ? ` as ${state.label}` : ""} on this computer, so a link
          cannot sign this page in. Sign in with Renown here too.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className={buttonClass}
            onClick={() => openRenown()}
          >
            Sign in with Renown
          </button>
          <button type="button" className={buttonClass} onClick={state.dismiss}>
            Continue without signing in
          </button>
        </div>
      </>
    );
  }
  return (
    <>
      <h1 id="backend-auth-gate-title" className="text-lg font-semibold">
        The sign-in link did not work
      </h1>
      <p className="text-sm text-core-muted">
        {FAILED_LINK[state.reason] ??
          `The server refused the sign-in link (${state.reason}).`}{" "}
        {FRESH_LINK}
      </p>
      <button type="button" className={buttonClass} onClick={state.dismiss}>
        Continue without signing in
      </button>
    </>
  );
}

function PasswordPrompt({
  state,
}: {
  state: Extract<LocalSignInState, { status: "password" }>;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy || !password) return;
        setBusy(true);
        void state.submit(password).finally(() => {
          setBusy(false);
          setPassword("");
        });
      }}
    >
      <h1 id="backend-auth-gate-title" className="text-lg font-semibold">
        Unlock this computer&apos;s identity
      </h1>
      <p className="text-sm text-core-muted">
        Your identity&apos;s key is locked with a password. It goes to the
        server on this computer that serves this page, and nowhere else.
      </p>
      {state.triesLeft !== undefined ? (
        <p role="alert" className="text-sm">
          That password does not unlock the key: {state.triesLeft}{" "}
          {state.triesLeft === 1 ? "try" : "tries"} left.
        </p>
      ) : null}
      <input
        type="password"
        autoComplete="current-password"
        aria-label="Password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        className="rounded border border-core-border bg-transparent px-2 py-1"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          className={buttonClass}
          disabled={busy || !password}
        >
          Unlock
        </button>
        <button type="button" className={buttonClass} onClick={state.dismiss}>
          Continue without signing in
        </button>
      </div>
    </form>
  );
}
