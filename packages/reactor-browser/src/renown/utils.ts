import type { IRenown, User } from "@renown/sdk";
import { logger, type IDocumentDriveServer } from "document-drive";
import { setLoginStatus, setUser } from "../connect.js";
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
): Promise<User | undefined> {
  if (!renown || !reactor) {
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
        renown.getBearerToken({ expiresIn: 10, aud: driveUrl }),
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
        renown.getBearerToken({ aud: driveUrl, expiresIn: 10 }),
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
  await renown?.logout();
  reactor?.removeJwtHandler();
}
