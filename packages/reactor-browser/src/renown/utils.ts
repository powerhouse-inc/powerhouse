import type { IRenown, User } from "@renown/sdk";
import type { WalletController, WalletSession } from "@renown/sdk/wallet";
import { logger } from "document-model";
import { RENOWN_CHAIN_ID, RENOWN_NETWORK_ID, RENOWN_URL } from "./constants.js";

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
export async function signIn(
  session: WalletSession,
): Promise<User | undefined> {
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

// Module-level registry for the active wallet controller. Connect mounts the
// configured adapter Providers and registers the controller for useRenownAuth.
let activeWalletController: WalletController | undefined;
let controllerWaiters: Array<{
  resolve: (controller: WalletController) => void;
  reject: (error: Error) => void;
}> = [];
let walletActivator: (() => Promise<WalletController>) | undefined;

export function setActiveWalletController(
  controller: WalletController | undefined,
): void {
  activeWalletController = controller;
  if (controller) {
    const waiters = controllerWaiters;
    controllerWaiters = [];
    waiters.forEach(({ resolve }) => resolve(controller));
  }
}

// Called when activation can't produce a controller (e.g. no adapter loaded
// because a peer dep is missing) so a pending login() rejects instead of hanging.
export function failWalletActivation(error: Error): void {
  const waiters = controllerWaiters;
  controllerWaiters = [];
  waiters.forEach(({ reject }) => reject(error));
}

export function getActiveWalletController(): WalletController | undefined {
  return activeWalletController;
}

// Registered by the app's wallet-provider mount. Lets login() mount the adapter
// Providers on demand (on click) instead of loading wallet libraries at startup.
export function setWalletActivator(
  activator: (() => Promise<WalletController>) | undefined,
): void {
  walletActivator = activator;
}

export function getWalletActivator():
  | (() => Promise<WalletController>)
  | undefined {
  return walletActivator;
}

// Resolves once a wallet controller is registered (after on-demand mount), or
// rejects if activation fails (see failWalletActivation).
export function whenWalletControllerReady(): Promise<WalletController> {
  if (activeWalletController) return Promise.resolve(activeWalletController);
  return new Promise((resolve, reject) =>
    controllerWaiters.push({ resolve, reject }),
  );
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
