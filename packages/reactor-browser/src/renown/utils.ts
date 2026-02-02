import type { IRenown, User } from "@renown/sdk";
import { logger } from "document-drive";
import { setLoginStatus } from "../hooks/login-status.js";
import { setUser } from "../hooks/user.js";
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
  renown: IRenown | undefined,
): Promise<User | undefined> {
  if (!renown) {
    return;
  }
  try {
    setLoginStatus("checking");
    const user = renown.user;

    if (user?.did && (user.did === userDid || !userDid)) {
      setLoginStatus("authorized");
      setUser(user);
      return user;
    }

    if (!userDid) {
      setLoginStatus("not-authorized");
      return;
    }

    const newUser = await renown.login(userDid);
    setLoginStatus("authorized");
    setUser(newUser);
    return newUser;
  } catch (error) {
    setLoginStatus("not-authorized");
    logger.error(error);
  }
}

export async function logout() {
  setLoginStatus("initial");
  setUser(undefined);

  const renown = window.ph?.renown;
  await renown?.logout();
}
