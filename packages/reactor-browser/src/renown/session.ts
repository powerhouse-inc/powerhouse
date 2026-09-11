import type { IRenown, User } from "@renown/sdk";
import type { WalletSession } from "@renown/sdk/wallet";
import { logger } from "document-model";
import {
  RENOWN_CHAIN_ID,
  RENOWN_NETWORK_ID,
  RENOWN_RETURN_URL_STRIPPED_PARAMS,
  RENOWN_URL,
} from "./constants.js";
import {
  getActiveWalletController,
  getWalletActivator,
} from "./wallet-registry.js";

export function openRenown(documentId?: string) {
  const renown = window.ph?.renown;
  let renownUrl = renown?.baseUrl;
  if (!renownUrl) {
    logger.warn("Renown instance not found, falling back to: @url", RENOWN_URL);
    renownUrl = RENOWN_URL;
  }

  if (documentId) {
    window.open(`${renownUrl}/profile/${documentId}`, "_blank")?.focus();
    return;
  }

  const url = new URL(renownUrl);
  url.searchParams.set("app", renown?.did ?? "");
  url.searchParams.set("connect", renown?.did ?? "");
  url.searchParams.set("network", RENOWN_NETWORK_ID);
  url.searchParams.set("chain", RENOWN_CHAIN_ID);

  // The whole location, so a shared link (`?driveUrl=`, feature flags, the
  // fragment) still resolves after the round trip -- minus the params that
  // would re-arm a redirect handler on the way back.
  const returnUrl = new URL(window.location.href);
  for (const param of RENOWN_RETURN_URL_STRIPPED_PARAMS) {
    returnUrl.searchParams.delete(param);
  }
  url.searchParams.set("returnUrl", returnUrl.toJSON());
  window.open(url, "_self")?.focus();
}

// In-page Renown sign-in: signs an app-key credential with the wallet session
// and logs in via the configured switchboard. Throws if no switchboard is set.
async function signIn(session: WalletSession): Promise<User | undefined> {
  const renown = window.ph?.renown;
  if (!renown) {
    logger.warn("Renown instance not found, cannot sign in");
    return;
  }
  return renown.signIn({
    address: session.address,
    chainId: session.chainId,
    signTypedData: session.signTypedData,
  });
}

// Idempotent sign-in gate the explicit login and OAuth-return auto-sign both
// funnel through, so a duplicate / in-flight / lingering trigger is a no-op.
let inFlightSignIn: Promise<User | undefined> | undefined;
let inFlightAddress: string | undefined;
let lastSignedAddress: string | undefined;

// The realtime socket stops retrying an auth refusal, because retrying the same
// credential cannot change the answer. Only a credential change can, so tell the
// client when one happens. Read off the ambient client rather than imported, so
// renown never pulls the graphql-client module graph in, and so a client without
// the method (the non-GraphQL browser client) is a no-op.
function notifyReactorClientCredentialsChanged(): void {
  const client = window.ph?.reactorClient as
    | { notifyCredentialsChanged?: () => void }
    | undefined;
  client?.notifyCredentialsChanged?.();
}

export async function completeSignIn(
  session: WalletSession,
): Promise<User | undefined> {
  const { address } = session;
  if (address === lastSignedAddress) return;
  if (inFlightSignIn && address === inFlightAddress) return inFlightSignIn;

  inFlightAddress = address;
  inFlightSignIn = (async () => {
    try {
      const user = await signIn(session);
      if (user) {
        lastSignedAddress = address;
        notifyReactorClientCredentialsChanged();
      }
      return user;
    } finally {
      inFlightSignIn = undefined;
      inFlightAddress = undefined;
    }
  })();
  return inFlightSignIn;
}

// Cleared by logout so the same address can sign in again afterward.
function resetSignInGuard(): void {
  inFlightSignIn = undefined;
  inFlightAddress = undefined;
  lastSignedAddress = undefined;
}

// True while a redirect sign-in is still inbound: the DID is in the URL but
// init has not consumed it yet, so an empty credential store is not the answer.
export function hasRedirectSignIn(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("user");
}

// Reads the `?user=` DID from the URL if present, then strips the param.
function consumeDidFromUrl(): string | undefined {
  if (typeof window === "undefined") return;

  const urlParams = new URLSearchParams(window.location.search);
  const userParam = urlParams.get("user");
  if (!userParam) return;

  const userDid = decodeURIComponent(userParam);

  // Clean up the URL parameter
  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete("user");
  window.history.replaceState({}, "", cleanUrl.toString());

  return userDid;
}

// Log in the user, resolving the DID from (in order): explicit arg, the `?user=`
// redirect param, then the Renown instance's stored session.
export async function login(
  userDid: string | undefined,
  renown: IRenown | undefined,
): Promise<User | undefined> {
  if (!renown) {
    return;
  }

  const did = userDid ?? consumeDidFromUrl();

  try {
    const user = renown.user;

    if (user?.did && (user.did === did || !did)) {
      return user;
    }

    if (!did) {
      return;
    }

    const loggedIn = await renown.login(did);
    notifyReactorClientCredentialsChanged();
    return loggedIn;
  } catch (error) {
    logger.error(
      error instanceof Error ? error.message : JSON.stringify(error),
    );
  }
}

export async function logout() {
  // Run the adapter's own logout first (Privy clears its session) so the next
  // login can't silently resume it. Adapters mount on demand, so activate when
  // none is mounted yet; with no activator (redirect-only) there is nothing to end.
  try {
    const controller =
      getActiveWalletController() ?? (await getWalletActivator()?.());
    await controller?.disconnect();
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
  }

  const renown = window.ph?.renown;
  await renown?.logout();
  resetSignInGuard();
  notifyReactorClientCredentialsChanged();

  // Clear the user parameter from URL to prevent auto-login on refresh
  const url = new URL(window.location.href);
  if (url.searchParams.has("user")) {
    url.searchParams.delete("user");
    window.history.replaceState(null, "", url.toString());
  }
}
