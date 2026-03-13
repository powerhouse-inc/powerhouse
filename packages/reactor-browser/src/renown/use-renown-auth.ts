import type { LoginStatus, User } from "@renown/sdk";
import { useCallback } from "react";
import { useLoginStatus, useUser } from "../hooks/renown.js";
import { logout as logoutUtil, openRenown } from "./utils.js";

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
  login: () => void;
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

  // syncs user with login status
  const status = toRenownAuthStatus(loginStatus, user);

  const address = user?.address;
  const ensName = user?.ens?.name;
  const avatarUrl = user?.profile?.userImage ?? user?.ens?.avatarUrl;
  const profileId = user?.profile?.documentId;

  const displayName = ensName ?? user?.profile?.username ?? undefined;
  const displayAddress = address ? truncateAddress(address) : undefined;

  const login = useCallback(() => {
    openRenown();
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
    logout,
    openProfile,
  };
}
