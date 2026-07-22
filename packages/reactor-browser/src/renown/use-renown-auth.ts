import type { LoginStatus, User } from "@renown/sdk";
import type { LoginMethod, WalletSession } from "@renown/sdk/wallet";
import { useCallback, useState } from "react";
import { useLoginStatus, useUser } from "../hooks/renown.js";
import {
  getActiveWalletController,
  getWalletActivator,
  logout as logoutUtil,
  openRenown,
  signIn,
} from "./utils.js";

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
        // signIn throws when no switchboard is configured; fall back to the
        // redirect flow only in that case so login still succeeds.
        await signIn(resolved);
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        if (/switchboard/i.test(err.message)) openRenown();
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
