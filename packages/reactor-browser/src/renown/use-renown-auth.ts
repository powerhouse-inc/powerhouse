import {
  MissingSwitchboardError,
  type LoginStatus,
  type User,
} from "@renown/sdk";
import type { LoginMethod, WalletSession } from "@renown/sdk/wallet";
import { useCallback, useState, useSyncExternalStore } from "react";
import { useLoginStatus, useUser } from "../hooks/renown.js";
import { useRenownInitialAuth } from "./initial-user.js";
import {
  getActiveWalletController,
  getWalletActivator,
} from "./wallet-registry.js";
import {
  completeSignIn,
  hasRedirectSignIn,
  logout as logoutUtil,
  openRenown,
} from "./session.js";

export type RenownAuthStatus = LoginStatus | "loading";

export interface RenownAuth {
  status: RenownAuthStatus | undefined;
  user: User | undefined;
  address: string | undefined;
  ensName: string | undefined;
  avatarUrl: string | undefined;
  profileId: string | undefined;
  displayName: string | undefined;
  displayAddress: string | undefined;
  login: (session?: WalletSession, method?: LoginMethod) => void;
  pending: boolean;
  error: Error | undefined;
  logout: () => Promise<void>;
  openProfile: () => void;
}

function truncateAddress(address: string): string {
  if (address.length <= 13) return address;
  return `${address.slice(0, 7)}...${address.slice(-5)}`;
}

// The user dismissed the provider modal (Privy `exited_auth_flow`, an injected
// wallet reject) — a benign cancel, not a login failure, so don't surface it.
function isUserCancellation(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return (
    msg.includes("exited_auth_flow") ||
    msg.includes("user rejected") ||
    msg.includes("user denied") ||
    msg.includes("userrejected") ||
    msg.includes("cancel")
  );
}

function toRenownAuthStatus(
  loginStatus: LoginStatus | "loading" | undefined,
  user: User | undefined,
): RenownAuthStatus | undefined {
  if (loginStatus === "authorized") {
    return user ? "authorized" : "checking";
  }
  return loginStatus;
}

export function useRenownAuth(): RenownAuth {
  const user = useUser();
  const loginStatus = useLoginStatus();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);

  // syncs user with login status
  const status = toRenownAuthStatus(loginStatus, user);

  const address = user?.address;
  const ensName = user?.ens?.name;
  const avatarUrl = user?.profile?.userImage ?? user?.ens?.avatarUrl;
  const profileId = user?.profile?.documentId;

  const displayName = ensName ?? user?.profile?.username ?? undefined;
  const displayAddress = address ? truncateAddress(address) : undefined;

  const login = useCallback((session?: WalletSession, method?: LoginMethod) => {
    // In-page sign-in path requires a session (passed in), an already-mounted
    // controller, or an activator that mounts the adapter on demand.
    const existing = getActiveWalletController();
    const activator = getWalletActivator();
    if (!session && !existing && !activator) {
      openRenown();
      return;
    }
    setPending(true);
    setError(undefined);
    void (async () => {
      try {
        let resolved = session;
        if (!resolved) {
          // Activate on click, then re-read the freshest controller so every
          // adapter that registered (not just the first) can route `method`.
          const activated =
            existing ?? (activator ? await activator() : undefined);
          const controller = getActiveWalletController() ?? activated;
          resolved = await controller?.connect(method);
        }
        if (!resolved) {
          openRenown();
          return;
        }
        // completeSignIn throws MissingSwitchboardError when none is configured;
        // fall back to the redirect flow only in that case so login still succeeds.
        await completeSignIn(resolved);
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        // A cancel clears pending (finally) without showing a red error.
        if (isUserCancellation(err)) return;
        setError(err);
        // Only when there is nowhere to post the credential. A switchboard that
        // REJECTED it is a failure to show, not a reason to leave the page.
        if (MissingSwitchboardError.is(err)) openRenown();
      } finally {
        setPending(false);
      }
    })();
  }, []);

  const logout = useCallback(async () => {
    await logoutUtil();
  }, []);

  const openProfile = useCallback(() => {
    if (profileId) {
      openRenown(profileId);
    }
  }, [profileId]);

  return {
    status,
    user,
    address,
    ensName,
    avatarUrl,
    profileId,
    displayName,
    displayAddress,
    login,
    pending,
    error,
    logout,
    openProfile,
  };
}

export type RenownAuthResolution =
  | "authenticated"
  | "resolving"
  | "unauthenticated";

export interface RenownAuthAsync extends RenownAuth {
  /** Collapsed routing state; "resolving" until auth is known. */
  state: RenownAuthResolution;
  isResolving: boolean;
}

const subscribeNothing = () => () => {};

// Auth as a resolved three-state value instead of via Suspense: renders a
// "resolving" phase you can branch on, so no Suspense boundary is required.
export function useRenownAuthAsync(): RenownAuthAsync {
  const auth = useRenownAuth();
  const initial = useRenownInitialAuth();
  // Server + hydration read false so the markup matches; the URL is checked
  // once mounted, which is when init would consume the DID anyway.
  const redirectSignIn = useSyncExternalStore(
    subscribeNothing,
    hasRedirectSignIn,
    () => false,
  );
  const { user, status, pending } = auth;
  let state: RenownAuthResolution;
  if (user) {
    state = "authenticated";
  } else if (pending) {
    state = "resolving";
  } else if (
    initial.state === "anonymous" &&
    // A redirect login is inbound, so the empty store is about to change; the
    // SDK only reports "checking" once init has consumed the DID.
    !redirectSignIn &&
    status !== "checking"
  ) {
    // Nothing to restore, so the SDK build cannot change the answer — resolve
    // now instead of spinning through IndexedDB and keypair setup.
    state = "unauthenticated";
  } else if (
    status === undefined ||
    status === "loading" ||
    status === "checking"
  ) {
    state = "resolving";
  } else {
    state = "unauthenticated";
  }
  return { ...auth, state, isResolving: state === "resolving" };
}
