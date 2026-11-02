import {
  setBackendAuth,
  useBackendAuth,
  useUser,
} from "@powerhousedao/reactor-browser";
import { logger } from "document-model";
import { useEffect, useRef } from "react";
import { relistDrives } from "./drive-relist.js";

/** What the gate shows: nothing, a sign-in, or a "not allowed" notice. */
export type BackendAuthGateMode = "login" | "unauthorized" | null;

/**
 * The gate decision for the app's backend: "login" when the backend refused
 * an anonymous caller, "unauthorized" when it refused a signed-in one.
 *
 * A change of identity after the refusal (a sign-in landing, a sign-out)
 * clears it and lists the drives again as the new caller; a refusal that
 * stands is recorded afresh by that listing. The caller a refusal was seen
 * for is kept in a ref rather than an effect cleanup: StrictMode runs
 * cleanups on its simulated unmount at mount, which cleared a refusal
 * recorded during boot before the root ever rendered the gate.
 */
export function useBackendAuthGate(): BackendAuthGateMode {
  const refusal = useBackendAuth();
  const user = useUser();
  const address = user?.address;
  const refusedAt = refusal?.at;
  const refusedAs = useRef<{ at: string; address: string | undefined }>(
    undefined,
  );
  useEffect(() => {
    if (!refusedAt) {
      refusedAs.current = undefined;
      return;
    }
    const seen = refusedAs.current;
    if (seen?.at !== refusedAt) {
      refusedAs.current = { at: refusedAt, address };
      return;
    }
    if (seen.address === address) return;
    refusedAs.current = undefined;
    setBackendAuth(undefined);
    relistDrives().catch((error: unknown) => {
      logger.warn(
        "Could not list the drives again after the identity changed: @error",
        error,
      );
    });
  }, [address, refusedAt]);
  if (!refusal) return null;
  // A 403 for a signed-in user is final until they switch account; a 401 for
  // a signed-in user means the token did not reach the backend yet (a stale
  // boot), which signing in again also fixes.
  return address ? "unauthorized" : "login";
}
