import type { IRenown } from "@renown/sdk";
import type { IConnectCrypto } from "../../crypto/index.js";
import { SessionStorageManager } from "../session-storage.js";
import { RENOWN_CHAIN_ID, RENOWN_NETWORK_ID, RENOWN_URL } from "./constants.js";
import { extractEthAddressFromDid } from "./did-parser.js";

interface RenownProfile {
  documentId: string;
  username: string | null;
  ethAddress: string | null;
  userImage: string | null;
  createdAt: string;
  updatedAt: string;
}

// Event types for user authentication state
export type LoginStatus =
  | "initial"
  | "checking"
  | "authorized"
  | "not-authorized";

export interface User {
  did: string;
  address: string;
  name?: string;
  email?: string;
  avatar?: string;
  ethAddress?: string;
}

// Helper function to fetch user profile from renown API
async function fetchUserProfileFromRenown(
  ethAddress: string,
): Promise<RenownProfile | null> {
  try {
    const response = await fetch(`${RENOWN_URL}/api/profile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ethAddress,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = (await response.json()) as {
      profile?: {
        documentId: string;
        username: string | null;
        ethAddress: string | null;
        userImage: string | null;
        createdAt: string;
        updatedAt: string;
      };
    };

    const profile = result.profile;

    if (profile) {
      return {
        documentId: profile.documentId,
        username: profile.username,
        ethAddress: profile.ethAddress,
        userImage: profile.userImage,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      };
    }

    return null;
  } catch (error) {
    console.error("Error fetching user profile from renown:", error);
    return null;
  }
}

// Helper function to fetch profile data for a user
export async function fetchProfileDataForUser(user: User): Promise<User> {
  try {
    const ethAddress = extractEthAddressFromDid(user.did);

    if (!ethAddress) {
      console.warn("Could not extract ETH address from DID:", user.did);
      return user;
    }

    // Get profile data from renown API
    const profile = await fetchUserProfileFromRenown(ethAddress);

    if (profile) {
      return {
        ...user,
        name: profile.username || undefined,
        avatar: profile.userImage || undefined,
        ethAddress: profile.ethAddress || undefined,
      };
    }

    // If no profile found, return user with ethAddress
    return {
      ...user,
      ethAddress,
    };
  } catch (error) {
    console.error("Failed to fetch profile data for user:", error);
    return user;
  }
}

// Global types for window extensions
declare global {
  interface Window {
    renown?: IRenown;
    reactor?: {
      setGenerateJwtHandler: (
        handler: (driveUrl: string) => Promise<string>,
      ) => void;
      removeJwtHandler: () => void;
    };
    connectCrypto?: IConnectCrypto;
  }
}

export async function openRenown() {
  const url = new URL(RENOWN_URL);

  // Get DID from connectCrypto if available
  let connectDid = "";
  if (window.connectCrypto) {
    try {
      connectDid = await window.connectCrypto.did();
    } catch (error) {
      console.error("Failed to get DID from connectCrypto:", error);
    }
  } else {
    console.warn(
      "connectCrypto not available - authentication may not be properly initialized",
    );
  }

  url.searchParams.set("connect", connectDid);
  url.searchParams.set("network", RENOWN_NETWORK_ID);
  url.searchParams.set("chain", RENOWN_CHAIN_ID);

  const returnUrl = new URL(window.location.pathname, window.location.origin);
  url.searchParams.set("returnUrl", returnUrl.toJSON());
  window.open(url, "_self")?.focus();
}

// Check for return from Renown authentication and handle login
export async function handleRenownReturn() {
  if (typeof window === "undefined") return;

  const urlParams = new URLSearchParams(window.location.search);
  const userDid = decodeURIComponent(urlParams.get("user") ?? "");

  // If we have authentication parameters, attempt login
  if (userDid && window.renown && window.connectCrypto) {
    try {
      await login(userDid, window.renown, window.connectCrypto);
      // Clean up URL parameters
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("user");
      window.history.replaceState({}, "", cleanUrl.toString());
    } catch (error) {
      console.error("Failed to handle Renown return:", error);
    }
  }
}

export async function login(
  userDid: string | undefined,
  renown: IRenown | undefined,
  connectCrypto: IConnectCrypto | undefined,
) {
  if (!renown || !connectCrypto) {
    return;
  }

  // Validate that userDid is a valid pkh DID format
  if (userDid && !userDid.startsWith("did:pkh:")) {
    console.warn(
      "Invalid DID format for login:",
      userDid,
      "- expected did:pkh: format",
    );
    return;
  }

  try {
    let user = renown.user instanceof Function ? renown.user() : renown.user;
    user = user instanceof Promise ? await user : user;

    if (user?.did && (user.did === userDid || !userDid)) {
      // Fetch profile data for the user
      const userWithProfile = await fetchProfileDataForUser(user);

      // Set up JWT handler if reactor is available

      // Store user data in sessionStorage for persistence
      SessionStorageManager.setUserData({
        user: userWithProfile,
        userDid: userWithProfile.did,
        loginStatus: "authorized",
        timestamp: Date.now(),
      });

      return userWithProfile;
    }

    if (!userDid) {
      return;
    }

    const newUser = await renown.login(userDid ?? "");
    if (newUser) {
      // Fetch profile data for the user
      const userWithProfile = await fetchProfileDataForUser(newUser);

      // Set up JWT handler if reactor is available

      // Store user data in sessionStorage for persistence
      SessionStorageManager.setUserData({
        user: userWithProfile,
        userDid: userWithProfile.did,
        loginStatus: "authorized",
        timestamp: Date.now(),
      });

      return userWithProfile;
    }
  } catch (error) {
    console.error("Renown login error:", error);
    throw error;
  }
}

export async function logout() {
  const renown = window.renown;
  const reactor = window.reactor;

  // Clear sessionStorage data
  SessionStorageManager.clearUserData();

  await renown?.logout();
  reactor?.removeJwtHandler();
}

/**
 * Re-authenticate using stored session data
 * This allows calling renown.login without needing to go through the full auth flow again
 */
export async function reauthenticateFromSession(): Promise<User | null> {
  if (
    typeof window === "undefined" ||
    !window.renown ||
    !window.connectCrypto
  ) {
    return null;
  }

  const storedUserDid = SessionStorageManager.getStoredUserDid();
  if (!storedUserDid) {
    return null;
  }

  try {
    await login(storedUserDid, window.renown, window.connectCrypto);

    // Get the current user after login
    let currentUser =
      window.renown.user instanceof Function
        ? window.renown.user()
        : window.renown.user;
    currentUser =
      currentUser instanceof Promise ? await currentUser : currentUser;

    if (currentUser) {
      // Fetch profile data for the restored user
      const userWithProfile = await fetchProfileDataForUser(currentUser);
      return userWithProfile;
    }

    return null;
  } catch (error) {
    console.error("Failed to re-authenticate from session:", error);
    return null;
  }
}
