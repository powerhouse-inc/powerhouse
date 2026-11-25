import type { SignInFragment } from "@powerhousedao/reactor-browser";

/**
 * Sign-in by link (F3d) at boot: `ph dev` and `ph vetra` open the page with
 * `#ph-sign-in=<code>`; `#ph-sign-out` drops the tab's sign-in. Read before
 * anything else runs, and out of the address bar (and the history) before
 * the router can drop the fragment or a reload can replay the code. Kept
 * dependency-free: the boot reads it before the runtime config.
 */

export const SIGN_IN_PARAM = "ph-sign-in";
export const SIGN_OUT_PARAM = "ph-sign-out";

/** What the fragment `hash` asks, if anything. */
export function readSignInFragment(hash: string): SignInFragment | undefined {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  if (params.has(SIGN_OUT_PARAM)) return { kind: "sign-out" };
  const code = params.get(SIGN_IN_PARAM)?.trim();
  return code ? { kind: "sign-in", code } : undefined;
}

/** `hash` without the sign-in parameters; the rest of it stays. */
export function withoutSignInFragment(hash: string): string {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  params.delete(SIGN_IN_PARAM);
  params.delete(SIGN_OUT_PARAM);
  const rest = params.toString();
  return rest ? `#${rest}` : "";
}

let pending: SignInFragment | undefined;

/** Reads and strips the fragment; the boot calls it first. */
export function takeSignInFragment(
  location: Pick<Location, "pathname" | "search" | "hash"> = window.location,
  history: Pick<History, "replaceState" | "state"> = window.history,
): void {
  const fragment = readSignInFragment(location.hash);
  if (!fragment) return;
  pending = fragment;
  history.replaceState(
    history.state,
    "",
    `${location.pathname}${location.search}${withoutSignInFragment(location.hash)}`,
  );
}

/** The fragment the boot took, handed over once. */
export function pendingSignInFragment(): SignInFragment | undefined {
  const taken = pending;
  pending = undefined;
  return taken;
}
