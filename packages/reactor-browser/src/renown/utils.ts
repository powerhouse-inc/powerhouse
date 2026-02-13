import { setLoginStatus, setUser } from "../connect.js";
import type { IConnectCrypto, IRenown, User } from "@renown/sdk";
import { logger, type IDocumentDriveServer } from "document-drive";
import { RENOWN_CHAIN_ID, RENOWN_NETWORK_ID, RENOWN_URL } from "./constants.js";

export function openRenown() {
  const url = new URL(RENOWN_URL);
  url.searchParams.set("connect", window.ph?.did ?? "");
  url.searchParams.set("network", RENOWN_NETWORK_ID);
  url.searchParams.set("chain", RENOWN_CHAIN_ID);

  const returnUrl = new URL(window.location.pathname, window.location.origin);
  url.searchParams.set("returnUrl", returnUrl.toJSON());
  window.open(url, "_self")?.focus();
}

export async function login(
  userDid: string | undefined,
  reactor: IDocumentDriveServer | undefined,
  renown: IRenown | undefined,
  connectCrypto: IConnectCrypto | undefined,
): Promise<User | undefined> {
  if (!renown || !connectCrypto || !reactor) {
    return;
  }
  try {
    setLoginStatus("checking");
    let user = renown.user instanceof Function ? renown.user() : renown.user;
    user = user instanceof Promise ? await user : user;

    if (user?.did && (user.did === userDid || !userDid)) {
      setLoginStatus("authorized");
      setUser(user);
      reactor.setGenerateJwtHandler(async (driveUrl) =>
        connectCrypto.getBearerToken(driveUrl, user.address, true, {
          expiresIn: 10,
        }),
      );
      return user;
    }

    if (!userDid) {
      return;
    }

    const newUser = await renown.login(userDid ?? "");
    if (newUser) {
      setLoginStatus("authorized");
      setUser(newUser);
      reactor.setGenerateJwtHandler(async (driveUrl) =>
        connectCrypto.getBearerToken(driveUrl, newUser.address, true, {
          expiresIn: 10,
        }),
      );
    } else {
      setLoginStatus("not-authorized");
    }
  } catch (error) {
    setLoginStatus("not-authorized");
    logger.error(error);
  }
}

export async function logout() {
  const renown = window.ph?.renown;
  const reactor = window.ph?.legacyReactor;
  setLoginStatus("initial");
  setUser(undefined);
  await renown?.logout();
  reactor?.removeJwtHandler();

  // Clear the user parameter from URL to prevent auto-login on refresh
  const url = new URL(window.location.href);
  if (url.searchParams.has("user")) {
    url.searchParams.delete("user");
    window.history.replaceState(null, "", url.toString());
  }
}
