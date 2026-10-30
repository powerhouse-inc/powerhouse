// The Vetra Studio plugin's UI: studio sign-in, run from the URL fragment.
// A plugin Root renders beside the app, outside the backend auth gate, so it
// works for the anonymous visitor an agent's fresh browser is.
import type { ConnectPluginUi } from "@powerhousedao/connect-core/plugins";
import { useRenown } from "@powerhousedao/reactor-browser";
import { BrowserKeyStorage } from "@renown/sdk";
import { useEffect, useRef, useState } from "react";
import {
  readStudioSignInRequest,
  signedInLocation,
  signInAsStudio,
  signOutOfStudio,
  type StudioSignInEnv,
  type StudioSignInRequest,
} from "./studio-sign-in.js";

type Status =
  | { state: "working"; message: string }
  | { state: "failed"; message: string };

function StudioSignIn() {
  const renown = useRenown();
  // Read once, at mount: the fragment is stripped before anything runs.
  const [request] = useState<StudioSignInRequest | undefined>(() =>
    readStudioSignInRequest(window.location.hash),
  );
  const [status, setStatus] = useState<Status | undefined>(
    request
      ? {
          state: "working",
          message:
            request.kind === "sign-in"
              ? "Signing in as the studio…"
              : "Signing out of the studio…",
        }
      : undefined,
  );
  const started = useRef(false);

  useEffect(() => {
    if (!request) return;
    // Out of the address bar (and the history) before the bearer is used.
    const { pathname, search } = window.location;
    window.history.replaceState(window.history.state, "", pathname + search);
  }, [request]);

  useEffect(() => {
    // The stored user is cleared through the Renown instance, so wait for it.
    if (!request || !renown || started.current) return;
    started.current = true;
    const run = async () => {
      const env: StudioSignInEnv = {
        fetch: window.fetch.bind(window),
        origin: window.location.origin,
        keyStorage: await BrowserKeyStorage.create(),
        logout: () => renown.logout(),
      };
      if (request.kind === "sign-out") {
        await signOutOfStudio(env);
        window.location.replace(window.location.pathname);
        return;
      }
      const identity = await signInAsStudio(request, env);
      setStatus({
        state: "working",
        message: `Signed in as ${identity.address}; reloading…`,
      });
      window.location.replace(
        signedInLocation(window.location, identity.userDid),
      );
    };
    run().catch((error: unknown) => {
      setStatus({
        state: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }, [request, renown]);

  if (!status) return null;
  return (
    <div
      role={status.state === "failed" ? "alert" : "status"}
      data-testid="studio-sign-in"
      data-state={status.state}
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 1000,
        maxWidth: 420,
        padding: "12px 16px",
        borderRadius: 8,
        font: "14px/1.4 system-ui, sans-serif",
        color: status.state === "failed" ? "#7f1d1d" : "#1f2937",
        background: status.state === "failed" ? "#fee2e2" : "#f3f4f6",
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      }}
    >
      {status.message}
    </div>
  );
}

const vetraStudioUi: ConnectPluginUi = {
  Root: StudioSignIn,
};

export default vetraStudioUi;
