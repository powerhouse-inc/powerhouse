import type { IRenown, User } from "@renown/sdk";
import { logger } from "document-drive";
import { RENOWN_CHAIN_ID, RENOWN_NETWORK_ID, RENOWN_URL } from "./constants.js";

export function openRenown(documentId?: string) {
  const renown = window.ph?.renown;
  let renownUrl = renown?.baseUrl;
  if (!renownUrl) {
    logger.warn("Renown instance not found, falling back to: ", RENOWN_URL);
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

/**
 * Reads the `?user=` DID from the URL if present.
 * Returns the DID and cleans up the URL parameter.
 */
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

/**
 * Log in the user. Resolves the user DID from (in order):
 * 1. Explicit `userDid` argument
 * 2. `?user=` URL parameter (from Renown portal redirect)
 * 3. Previously stored session in the Renown instance
 */
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
  const renown = window.ph?.renown;
  await renown?.logout();

  // Clear the user parameter from URL to prevent auto-login on refresh
  const url = new URL(window.location.href);
  if (url.searchParams.has("user")) {
    url.searchParams.delete("user");
    window.history.replaceState(null, "", url.toString());
  }
}
