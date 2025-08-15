import { logger } from "document-drive";
import { dispatchSetLoginStatusEvent } from "../events/events.js";
import { RENOWN_CHAIN_ID, RENOWN_NETWORK_ID, RENOWN_URL } from "./constants.js";

export function openRenown() {
  const url = new URL(RENOWN_URL);
  url.searchParams.set("connect", window.did ?? "");
  url.searchParams.set("network", RENOWN_NETWORK_ID);
  url.searchParams.set("chain", RENOWN_CHAIN_ID);

  const returnUrl = new URL(window.location.pathname, window.location.origin);
  url.searchParams.set("returnUrl", returnUrl.toJSON());
  window.open(url, "_self")?.focus();
}

export async function login(userDid: string) {
  const renown = window.renown;
  const connectCrypto = window.connectCrypto;
  const reactor = window.reactor;

  if (!renown || !connectCrypto) {
    return;
  }
  try {
    dispatchSetLoginStatusEvent("checking");
    let user = renown.user instanceof Function ? renown.user() : renown.user;
    user = user instanceof Promise ? await user : user;

    if (user?.did === userDid) {
      dispatchSetLoginStatusEvent("authorized");
      return user;
    }
    const newUser = await renown.login(userDid);
    if (newUser) {
      dispatchSetLoginStatusEvent("authorized");

      reactor?.setGenerateJwtHandler(
        async (driveUrl) =>
          connectCrypto.getBearerToken?.(driveUrl, newUser.address) ?? "",
      );

      return newUser;
    } else {
      dispatchSetLoginStatusEvent("not-authorized");
    }
  } catch (error) {
    dispatchSetLoginStatusEvent("not-authorized");
    logger.error(error);
  }
}

export async function logout() {
  const renown = window.renown;
  const reactor = window.reactor;
  dispatchSetLoginStatusEvent("initial");
  await renown?.logout();
  reactor?.removeJwtHandler();
}
