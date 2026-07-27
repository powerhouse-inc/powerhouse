import type { IRenown, User } from "@renown/sdk";
import type { WalletSession } from "@renown/sdk/wallet";
import { logger } from "document-model";
import { RENOWN_CHAIN_ID, RENOWN_NETWORK_ID, RENOWN_URL } from "./constants.js";
import { getActiveWalletController } from "./wallet-registry.js";

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

  const returnUrl = new URL(window.location.pathname, window.location.origin);
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
      if (user) lastSignedAddress = address;
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

    return await renown.login(did);
  } catch (error) {
    logger.error(
      error instanceof Error ? error.message : JSON.stringify(error),
    );
  }
}

export async function logout() {
  // Disconnect the wallet first — while still authenticated the adapters are
  // mounted, so each adapter's own logout (Privy clears its session) runs first.
  try {
    await getActiveWalletController()?.disconnect();
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
  }

  const renown = window.ph?.renown;
  await renown?.logout();
  resetSignInGuard();

  // Clear the user parameter from URL to prevent auto-login on refresh
  const url = new URL(window.location.href);
  if (url.searchParams.has("user")) {
    url.searchParams.delete("user");
    window.history.replaceState(null, "", url.toString());
  }
}
